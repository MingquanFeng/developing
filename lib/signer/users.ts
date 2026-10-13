/**
 * 用户存储 —— SQLite（Node 内置 node:sqlite，零依赖、无需编译原生模块）
 *
 * 为什么用户进 SQLite 而照片清单还在 COS：
 *   用户表要的是**约束**（用户名唯一、不能有重名）和**高频点查**，
 *   这正是关系库擅长、而 JSON 文件每次登录都要重新读一遍解码的东西。
 *   照片清单是一份整体读写的文档，且和图片同在 COS，天然该放一起。
 *
 * ⚠️ 部署前提：数据库文件必须在**持久化磁盘**上。
 *    CVM / 轻量应用服务器没问题；SCF、CloudBase 这类无状态运行时
 *    重启后文件系统会清空，用户会全部消失 —— 那种环境不能用 SQLite。
 */
import { createHmac } from "node:crypto";
// @ts-expect-error node:sqlite 是 Node 22+ 内置模块，@types/node 20 还没声明
import { DatabaseSync } from "node:sqlite";
import * as fs from "node:fs";
import * as path from "node:path";
import bcrypt from "bcryptjs";
import { config } from "./config";

export type Role = "admin" | "viewer";

export type User = {
  id: string;
  username: string;
  /** bcrypt 哈希，绝不返回给前端 */
  passwordHash: string;
  displayName: string;
  role: Role;
  disabled: boolean;
  /**
   * 会话版本号。改密 / 重置 / 踢人时 +1，旧 token 立即失效。
   * 默认 1（迁移时回填）。
   */
  sessionVersion: number;
  /** 最近一次登录来源 IP。无（从未登录或后端没记录）时为 null。 */
  lastLoginIp?: string | null;
  createdAt: string;
  lastLoginAt?: string;
};

/** 对外暴露的形态：永远不含 passwordHash */
export type PublicUser = Omit<User, "passwordHash">;

const DB_PATH = process.env.USERS_DB_PATH
  ? path.resolve(process.env.USERS_DB_PATH)
  : path.join(process.cwd(), "data", "users.db");

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);

/**
 * 创建表时一气呵成把 schema 写齐 —— `role` / `session_version` 都是后加的，
 * 由下面的 migrate 函数通过 `PRAGMA table_info` 检测再加列。
 *
 * 安全日志（失败登录、注册尝试、提权失败等）和重置令牌
 * 是同一份用户管理的\"账本\"，都放这张库。
 */
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    display_name  TEXT NOT NULL,
    disabled      INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL,
    last_login_at TEXT
  );

  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    token_hash   TEXT PRIMARY KEY,        -- HMAC(token)，明文不存
    user_id      TEXT NOT NULL,
    issued_by    TEXT NOT NULL,           -- 哪个 admin 签的，便于事后追责
    expires_at   TEXT NOT NULL,
    used_at      TEXT                     -- 用过即写，一次性
  );
  CREATE INDEX IF NOT EXISTS idx_reset_user ON password_reset_tokens(user_id);

  CREATE TABLE IF NOT EXISTS security_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    kind        TEXT NOT NULL,            -- 'login_fail' | 'login_success' | 'register_attempt' | 'register_fail' | 'register_ok' | 'session_invalid' | 'password_changed' | 'password_reset' | 'session_revoked'
    user_ref    TEXT,                      -- 尝试的用户名（注册时可能为 NULL）
    ip          TEXT NOT NULL,
    detail      TEXT,                      -- JSON
    created_at  TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_security_ip        ON security_log(ip, created_at);
  CREATE INDEX IF NOT EXISTS idx_security_user      ON security_log(user_ref, created_at);
  CREATE INDEX IF NOT EXISTS idx_security_kind_time ON security_log(kind, created_at);
`);

/**
 * 一次性迁移：加 role 列。
 *
 * 加列前建的老账号全是管理员（那时还没有角色概念），
 * 所以一律回填 admin —— 绝不能让存量用户因为迁移掉权。
 * 迁移后再注册的新账号才落到默认的 viewer。
 */
function migrateAddRole(): void {
  const cols = db.prepare("PRAGMA table_info(users)").all() as {
    name: string;
  }[];
  if (cols.some((c) => c.name === "role")) return;

  db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'admin'");
  db.exec("UPDATE users SET role = 'admin' WHERE role IS NULL OR role = ''");
}
migrateAddRole();

/**
 * 一次性迁移：加 session_version 列。
 *
 * 用于踢人：颁发 session 时把当前 version 拼进 token，验签时再查 DB 对比。
 * 改密、admin 重置、被踢都要 bump version。存量用户的 version=1，
 * 部署后浏览器会触发 401 → 自然回登录页（已有处理路径）。
 */
function migrateAddSessionVersion(): void {
  const cols = db.prepare("PRAGMA table_info(users)").all() as {
    name: string;
  }[];
  if (cols.some((c) => c.name === "session_version")) return;
  db.exec(
    "ALTER TABLE users ADD COLUMN session_version INTEGER NOT NULL DEFAULT 1",
  );
}
migrateAddSessionVersion();

/**
 * 加 last_login_ip：登录时记录最近一次登录来源 IP（取自 clientIp）。
 * 不会暴露密码；admin 后台可看，便于发现"在哪儿登的"。
 */
function migrateAddLastLoginIp(): void {
  const cols = db.prepare("PRAGMA table_info(users)").all() as {
    name: string;
  }[];
  if (cols.some((c) => c.name === "last_login_ip")) return;
  db.exec("ALTER TABLE users ADD COLUMN last_login_ip TEXT");
}
migrateAddLastLoginIp();

const newId = () =>
  `usr_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const toUser = (r: Record<string, unknown>): User => ({
  id: r.id as string,
  username: r.username as string,
  passwordHash: r.password_hash as string,
  displayName: r.display_name as string,
  role: (r.role as Role) ?? "viewer",
  disabled: !!r.disabled,
  sessionVersion:
    typeof r.session_version === "number"
      ? (r.session_version as number)
      : Number(r.session_version ?? 1) || 1,
  lastLoginIp: (r.last_login_ip as string) ?? null,
  createdAt: r.created_at as string,
  lastLoginAt: (r.last_login_at as string) ?? undefined,
});

export const toPublic = (u: User): PublicUser => {
  const { passwordHash: _drop, ...rest } = u;
  return rest;
};

/* ---------- 校验 ---------- */

export function validUsername(name: string): string | null {
  if (!name) return "用户名不能为空";
  if (name.length < 3) return "用户名至少 3 位";
  if (name.length > 32) return "用户名最多 32 位";
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(name)) {
    return "只能用字母、数字、下划线、连字符，且不能以符号开头";
  }
  return null;
}

export function validPassword(p: string): string | null {
  if (!p) return "密码不能为空";
  if (p.length < 8) return "密码至少 8 位";
  if (p.length > 200) return "密码过长";
  return null;
}

/**
 * 用户名黑名单 —— 这些名字不能让自助注册抢注：
 *   - 内部角色名（admin / root / system / signer）
 *   - 通用保留名
 *   - 历史上 dev 设过的"特殊"账号（photog、assistant）
 *
 * 部署环境可以用 USERNAME_RESERVED 追加（逗号分隔），覆盖下面的默认。
 */
const DEFAULT_RESERVED: ReadonlySet<string> = new Set(
  [
    "admin",
    "administrator",
    "root",
    "system",
    "signer",
    "photographer",
    "photog",
    "assistant",
  ].map((s) => s.toLowerCase()),
);

export function getReservedUsernames(): Set<string> {
  const envExtra = (process.env.USERNAME_RESERVED ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return new Set([...DEFAULT_RESERVED, ...envExtra]);
}

export function validUsernameReserved(name: string): string | null {
  if (getReservedUsernames().has(name.toLowerCase())) {
    return "此用户名为系统保留，请换一个";
  }
  return null;
}

/* ---------- 读 ---------- */

const Q = {
  byUsername: db.prepare("SELECT * FROM users WHERE username = ?"),
  byId: db.prepare("SELECT * FROM users WHERE id = ?"),
  all: db.prepare("SELECT * FROM users ORDER BY created_at ASC"),
  count: db.prepare("SELECT COUNT(*) AS n FROM users"),
  countActiveAdmins: db.prepare(
    "SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND disabled = 0",
  ),
};

export const findByUsername = (u: string): User | undefined => {
  const r = Q.byUsername.get(u);
  return r ? toUser(r as Record<string, unknown>) : undefined;
};

export const findById = (id: string): User | undefined => {
  const r = Q.byId.get(id);
  return r ? toUser(r as Record<string, unknown>) : undefined;
};

export const listUsers = (): PublicUser[] =>
  (Q.all.all() as Record<string, unknown>[]).map((r) => toPublic(toUser(r)));

export const countUsers = (): number =>
  (Q.count.get() as { n: number }).n;

/** 还能登进来管人的管理员数。降级/停用前用它兜底，防止把系统锁死 */
export const countAdmins = (): number =>
  (Q.countActiveAdmins.get() as { n: number }).n;

/* ---------- 写 ---------- */

export async function createUser(input: {
  username: string;
  password: string;
  displayName?: string;
  /** 不传则按 viewer —— 公开注册必须显式走这个默认，不能默认 admin */
  role?: Role;
}): Promise<PublicUser> {
  const reserved = validUsernameReserved(input.username);
  if (reserved) {
    throw Object.assign(new Error("username_reserved"), { code: "username_reserved" });
  }
  const user: User = {
    id: newId(),
    username: input.username,
    passwordHash: await bcrypt.hash(input.password, 10),
    displayName: input.displayName?.trim() || input.username,
    role: input.role ?? "viewer",
    disabled: false,
    sessionVersion: 1,
    createdAt: new Date().toISOString(),
  };
  try {
    db.prepare(
      `INSERT INTO users (id, username, password_hash, display_name, role, disabled, session_version, created_at)
       VALUES (?, ?, ?, ?, ?, 0, 1, ?)`,
    ).run(
      user.id,
      user.username,
      user.passwordHash,
      user.displayName,
      user.role,
      user.createdAt,
    );
  } catch (e) {
    if (String((e as { code?: string }).code).includes("ERR_SQLITE_ERROR")) {
      throw Object.assign(new Error("username_taken"), { code: "username_taken" });
    }
    throw e
  }
  return toPublic(user);
}

/** 抛带 code 的错误：username_taken / username_reserved */
function rejectCreate(code: string, message: string): never {
  throw Object.assign(new Error(code), { code });
}

export async function updateUser(
  id: string,
  patch: {
    displayName?: string;
    password?: string;
    disabled?: boolean;
    role?: Role;
  },
  options: { bumpSession?: boolean } = { bumpSession: true },
): Promise<PublicUser> {
  const cur = findById(id);
  if (!cur) throw Object.assign(new Error("not_found"), { code: "not_found" });

  const displayName = patch.displayName?.trim() || cur.displayName;
  const disabled = patch.disabled === undefined ? cur.disabled : !!patch.disabled;
  const hash = patch.password ? await bcrypt.hash(patch.password, 10) : cur.passwordHash;

  // 降级/停用管理员前，先确认不会是最后一个能管用户的人
  if (cur.role === "admin" && (patch.role === "viewer" || patch.disabled === true)) {
    if (countAdmins() <= 1) {
      throw Object.assign(new Error("last_admin"), { code: "last_admin" });
    }
  }

  const role = patch.role ?? cur.role;

  // 默认 bumpSessionVersion=1 —— 任何 update 都让旧会话失效。
  // 安全账本：宁可踢错、不可漏踢。管理员改个昵称也踢，靠\"显式 opt-out\"
  // 才能跳过。
  const newVersion = options.bumpSession ? cur.sessionVersion + 1 : cur.sessionVersion;

  db.prepare(
    `UPDATE users
       SET display_name     = ?,
           password_hash    = ?,
           disabled         = ?,
           role             = ?,
           session_version  = ?
     WHERE id = ?`,
  ).run(displayName, hash, disabled ? 1 : 0, role, newVersion, id);

  return toPublic({
    ...cur,
    displayName,
    passwordHash: hash,
    disabled,
    role,
    sessionVersion: newVersion,
  });
}

/**
 * 单纯 +1 session_version。admin 一键\"踢出此账号\"用它 —— 不改其它字段。
 * 返回新版本号；找不到用户返回 null。
 */
export function bumpSessionVersion(id: string): number | null {
  const cur = findById(id);
  if (!cur) return null;
  const next = cur.sessionVersion + 1;
  db.prepare("UPDATE users SET session_version = ? WHERE id = ?").run(next, id);
  return next;
}

export function deleteUser(id: string): void {
  const cur = findById(id);
  if (!cur) throw Object.assign(new Error("not_found"), { code: "not_found" });
  // 不能删光，否则谁都进不来了
  if (countUsers() <= 1) {
    throw Object.assign(new Error("last_user"), { code: "last_user" });
  }
  // 删掉最后一个管理员同样会锁死用户管理
  if (cur.role === "admin" && countAdmins() <= 1) {
    throw Object.assign(new Error("last_admin"), { code: "last_admin" });
  }
  db.prepare("DELETE FROM users WHERE id = ?").run(id);
}

export function touchLogin(id: string, ip: string): void {
  db.prepare(
    "UPDATE users SET last_login_at = ?, last_login_ip = ? WHERE id = ?",
  ).run(new Date().toISOString(), ip, id);
}

/* ============================================================
   重置密码链接（一次性 token）
   ------------------------------------------------------------
   token 明文只在签发瞬间留在 URL 里；库中只存 token_hash（HMAC）。
   即便被 SQL 注入拖库，也做不到：
   - 反推明文（HMAC 单向）
   - 伪造新的（没密钥）
   这么做跟 session cookie 的 HMAC 是同一思路。
   ============================================================ */

const QToken = {
  byHash: db.prepare("SELECT * FROM password_reset_tokens WHERE token_hash = ?"),
  byUser: db.prepare("SELECT * FROM password_reset_tokens WHERE user_id = ? ORDER BY expires_at DESC"),
  insert: db.prepare(
    `INSERT INTO password_reset_tokens (token_hash, user_id, issued_by, expires_at)
     VALUES (?, ?, ?, ?)`,
  ),
  markUsed: db.prepare("UPDATE password_reset_tokens SET used_at = ? WHERE token_hash = ?"),
};

export type ResetRecord = {
  tokenHash: string;
  userId: string;
  issuedBy: string;
  expiresAt: string;
  usedAt: string | null;
};

const rowToReset = (r: Record<string, unknown>): ResetRecord => ({
  tokenHash: r.token_hash as string,
  userId: r.user_id as string,
  issuedBy: r.issued_by as string,
  expiresAt: r.expires_at as string,
  usedAt: (r.used_at as string) ?? null,
});

export function hashResetToken(token: string): string {
  return createHmac("sha256", config.sessionSecret)
    .update(`reset:${token}`)
    .digest("hex");
}

export function createResetToken(
  userId: string,
  issuedBy: string,
  ttlSec: number,
): { token: string; expiresAt: string } {
  const random = createHmac("sha256", config.sessionSecret)
    .update(`reset_seed:${Date.now()}:${Math.random()}:${userId}`)
    .digest("hex");
  const token = random;
  const expiresAt = new Date(Date.now() + ttlSec * 1000).toISOString();
  QToken.insert.run(hashResetToken(token), userId, issuedBy, expiresAt);
  return { token, expiresAt };
}

export function findResetToken(token: string): ResetRecord | undefined {
  const row = QToken.byHash.get(hashResetToken(token));
  return row ? rowToReset(row as Record<string, unknown>) : undefined;
}

export function listResetTokensByUser(userId: string): ResetRecord[] {
  return (QToken.byUser.all(userId) as Record<string, unknown>[]).map(rowToReset);
}

/**
 * 一次性消费：写 used_at 并返回记录。已用过 / 已过期返回相应错误。
 * 调用前要 findResetToken 拿到行；这里只管\"一次性\"语义。
 */
export function consumeResetToken(token: string): ResetRecord {
  const rec = findResetToken(token);
  if (!rec) {
    throw Object.assign(new Error("token_not_found"), { code: "token_not_found" });
  }
  if (rec.usedAt) {
    throw Object.assign(new Error("token_used"), { code: "token_used" });
  }
  if (Date.parse(rec.expiresAt) <= Date.now()) {
    throw Object.assign(new Error("token_expired"), { code: "token_expired" });
  }
  QToken.markUsed.run(new Date().toISOString(), rec.tokenHash);
  return { ...rec, usedAt: new Date().toISOString() };
}

/* ============================================================
   安全日志
   ------------------------------------------------------------
   失败的登录、注册尝试、踢人等都进 security_log。
   限流判定也从这里读 —— 取代之前那俩 in-memory Map，
   服务重启不丢、不同实例共享（如果以后是多实例）。
   ============================================================ */

const QLog = {
  insert: db.prepare(
    `INSERT INTO security_log (kind, user_ref, ip, detail, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ),
  countLoginFail: db.prepare(
    `SELECT COUNT(*) AS n FROM security_log
       WHERE kind = 'login_fail' AND created_at >= ?
         AND ((user_ref IS NOT NULL AND user_ref = ?) OR ip = ?)`,
  ),
  countRegisterAttempt: db.prepare(
    `SELECT COUNT(*) AS n FROM security_log
       WHERE kind = 'register_attempt' AND created_at >= ? AND ip = ?`,
  ),
};

export type SecurityLogKind =
  | "login_fail"
  | "login_success"
  | "register_attempt"
  | "register_fail"
  | "register_ok"
  | "session_invalid"
  | "password_changed"
  | "password_reset"
  | "session_revoked";

export function recordSecurityEvent(input: {
  kind: SecurityLogKind;
  userRef?: string | null;
  ip: string;
  detail?: unknown;
}): void {
  QLog.insert.run(
    input.kind,
    input.userRef ?? null,
    input.ip,
    input.detail === undefined ? null : JSON.stringify(input.detail),
    new Date().toISOString(),
  );
}

export function countLoginFailures(
  ip: string,
  username: string,
  windowMs: number,
): number {
  const r = QLog.countLoginFail.get(
    new Date(Date.now() - windowMs).toISOString(),
    username,
    ip,
  ) as { n: number };
  return r.n;
}

export function countRegisterAttempts(ip: string, windowMs: number): number {
  const r = QLog.countRegisterAttempt.get(
    new Date(Date.now() - windowMs).toISOString(),
    ip,
  ) as { n: number };
  return r.n;
}

/** 登录校验。用户名不存在时也跑一次 bcrypt，抹平时间差，避免枚举用户名 */
export async function verifyCredentials(
  username: string,
  password: string,
): Promise<User | null> {
  const user = findByUsername(username);
  if (!user) {
    await bcrypt.compare(
      password,
      "$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv",
    );
    return null;
  }
  if (user.disabled) return null;
  return (await bcrypt.compare(password, user.passwordHash)) ? user : null;
}

/* ---------- 会话密钥 ---------- */

/** 共享口令已移除。会话签名密钥只能来自 SESSION_SECRET，没有退路 */
export function assertSessionSecret(): void {
  if (!config.sessionSecret || config.sessionSecret.length < 16) {
    throw new Error(
      "SESSION_SECRET 未配置或过短（至少 16 位）。共享口令机制已移除，会话密钥没有其他来源。",
    );
  }
}

export const dbFile = DB_PATH;