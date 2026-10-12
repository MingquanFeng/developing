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
import { DatabaseSync } from "node:sqlite";
import * as fs from "node:fs";
import * as path from "node:path";
import bcrypt from "bcryptjs";
import { config } from "./config";

export type User = {
  id: string;
  username: string;
  /** bcrypt 哈希，绝不返回给前端 */
  passwordHash: string;
  displayName: string;
  disabled: boolean;
  createdAt: string;
  lastLoginAt?: string;
};

/** 对外暴露的形态：永远不含 passwordHash */
export type PublicUser = Omit<User, "passwordHash">;

const DB_PATH = process.env.SIGNER_DB_PATH
  ? path.resolve(process.env.SIGNER_DB_PATH)
  : path.join(__dirname, "..", "data", "users.db");

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);

/* 用户名唯一、且大小写不敏感：Alice 与 alice 不能共存 */
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
`);

const newId = () =>
  `usr_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const toUser = (r: Record<string, unknown>): User => ({
  id: r.id as string,
  username: r.username as string,
  passwordHash: r.password_hash as string,
  displayName: r.display_name as string,
  disabled: !!r.disabled,
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

/* ---------- 读 ---------- */

const Q = {
  byUsername: db.prepare("SELECT * FROM users WHERE username = ?"),
  byId: db.prepare("SELECT * FROM users WHERE id = ?"),
  all: db.prepare("SELECT * FROM users ORDER BY created_at ASC"),
  count: db.prepare("SELECT COUNT(*) AS n FROM users"),
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

/* ---------- 写 ---------- */

export async function createUser(input: {
  username: string;
  password: string;
  displayName?: string;
}): Promise<PublicUser> {
  const user: User = {
    id: newId(),
    username: input.username,
    passwordHash: await bcrypt.hash(input.password, 10),
    displayName: input.displayName?.trim() || input.username,
    disabled: false,
    createdAt: new Date().toISOString(),
  };
  try {
    db.prepare(
      `INSERT INTO users (id, username, password_hash, display_name, disabled, created_at)
       VALUES (?, ?, ?, ?, 0, ?)`,
    ).run(user.id, user.username, user.passwordHash, user.displayName, user.createdAt);
  } catch (e) {
    if (String((e as { code?: string }).code).includes("ERR_SQLITE_ERROR")) {
      throw Object.assign(new Error("username_taken"), { code: "username_taken" });
    }
    throw e;
  }
  return toPublic(user);
}

export async function updateUser(
  id: string,
  patch: { displayName?: string; password?: string; disabled?: boolean },
): Promise<PublicUser> {
  const cur = findById(id);
  if (!cur) throw Object.assign(new Error("not_found"), { code: "not_found" });

  const displayName = patch.displayName?.trim() || cur.displayName;
  const disabled = patch.disabled === undefined ? cur.disabled : !!patch.disabled;
  const hash = patch.password ? await bcrypt.hash(patch.password, 10) : cur.passwordHash;

  db.prepare(
    `UPDATE users SET display_name = ?, password_hash = ?, disabled = ? WHERE id = ?`,
  ).run(displayName, hash, disabled ? 1 : 0, id);

  return toPublic({
    ...cur,
    displayName,
    passwordHash: hash,
    disabled,
  });
}

export function deleteUser(id: string): void {
  const cur = findById(id);
  if (!cur) throw Object.assign(new Error("not_found"), { code: "not_found" });
  // 不能删光，否则谁都进不来了
  if (countUsers() <= 1) {
    throw Object.assign(new Error("last_user"), { code: "last_user" });
  }
  db.prepare("DELETE FROM users WHERE id = ?").run(id);
}

export function touchLogin(id: string): void {
  db.prepare("UPDATE users SET last_login_at = ? WHERE id = ?").run(
    new Date().toISOString(),
    id,
  );
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