import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { config, SESSION_TTL_SEC } from "./config";
import {
  countLoginFailures,
  countRegisterAttempts,
  findById,
  recordSecurityEvent,
  verifyCredentials,
  type User,
} from "./users";
import type { SessionToken as SessionTokenContract } from "@/lib/contracts";

const COOKIE_NAME = "album_session";

/* ============================================================
   令牌形如 <userId>.<过期ms>.<sessionVersion>.<签名>
   - sessionVersion 让改密 / 重置 / 踢人能精准作废旧会话
   - 部署切换瞬间强制全员重登一次（不再兼容旧三段格式）：
     反正 SESSION_TTL_SEC 是 30 天，影响有限；混着识别会留隐患。
   ============================================================ */

const hmac = (payload: string) =>
  createHmac("sha256", config.sessionSecret).update(payload).digest("hex");

export function issueSession(
  user: Pick<User, "id" | "sessionVersion">,
): string {
  const exp = Date.now() + SESSION_TTL_SEC * 1000;
  const payload = `${user.id}.${exp}.${user.sessionVersion}`;
  return `${payload}.${hmac(payload)}`;
}

export type SessionToken = SessionTokenContract;

export function verifySession(token: string | undefined): SessionToken | null {
  if (!token) return null;

  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [userId, exp, version, sig] = parts;

  const expected = hmac(`${userId}.${exp}.${version}`);
  if (sig.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  if (Number(exp) <= Date.now()) return null;

  const v = Number(version);
  if (!Number.isFinite(v) || v < 1) return null;

  return { userId, sessionVersion: v };
}

/** 转发到 users.ts 的 SQLite 校验：用户名大小写不敏感 + bcrypt */
export const checkCredentials = verifyCredentials;

/* ============================================================
   登录 / 注册限流（DB-backed）
   ============================================================ */

export const LOGIN_LOCK_MS = 15 * 60 * 1000;
export const REGISTER_LOCK_MS = 60 * 60 * 1000;
export const MAX_LOGIN_ATTEMPTS = 5;
export const MAX_REGISTER_ATTEMPTS = 10;

export function isLocked(ip: string, username: string): boolean {
  if (!username) return false;
  return (
    countLoginFailures(ip, username, LOGIN_LOCK_MS) >= MAX_LOGIN_ATTEMPTS
  );
}

export function noteFailure(
  ip: string,
  username: string,
  detail?: unknown,
): void {
  recordSecurityEvent({
    kind: "login_fail",
    userRef: username || null,
    ip,
    detail,
  });
}

/** 不\"清\"失败 —— 失败就是失败，留着方便审计 */
export function clearFailures(_ip: string, _username: string): void {
  /* 限流窗口靠 LOGIN_LOCK_MS 自然过期，行为上等价 */
}

export function isRegisterLocked(ip: string): boolean {
  return countRegisterAttempts(ip, REGISTER_LOCK_MS) >= MAX_REGISTER_ATTEMPTS;
}

export function noteRegisterAttempt(ip: string): void {
  recordSecurityEvent({ kind: "register_attempt", ip });
}

export function noteRegisterSuccess(ip: string, username: string): void {
  recordSecurityEvent({ kind: "register_ok", userRef: username, ip });
}

export function noteRegisterFail(
  ip: string,
  username: string,
  detail?: unknown,
): void {
  recordSecurityEvent({
    kind: "register_fail",
    userRef: username,
    ip,
    detail,
  });
}

export function noteLoginSuccess(ip: string, username: string): void {
  recordSecurityEvent({ kind: "login_success", userRef: username, ip });
}

export function noteSessionInvalid(
  ip: string,
  userId: string | null,
  detail?: unknown,
): void {
  recordSecurityEvent({
    kind: "session_invalid",
    userRef: userId,
    ip,
    detail,
  });
}

export function notePasswordChanged(
  ip: string,
  username: string,
  by: string,
): void {
  recordSecurityEvent({
    kind: "password_changed",
    userRef: username,
    ip,
    detail: { by },
  });
}

export function notePasswordReset(
  ip: string,
  username: string,
  issuedBy: string | null,
): void {
  recordSecurityEvent({
    kind: "password_reset",
    userRef: username,
    ip,
    detail: { issuedBy },
  });
}

export function noteSessionRevoked(
  ip: string,
  targetUsername: string,
  by: string,
): void {
  recordSecurityEvent({
    kind: "session_revoked",
    userRef: targetUsername,
    ip,
    detail: { by },
  });
}

/* ---------- Cookie ---------- */

export function readCookie(req: NextRequest, name: string): string | undefined {
  const raw = req.headers.get("cookie");
  if (!raw) return undefined;
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

export const setSessionCookie = (token: string) =>
  [
    `${COOKIE_NAME}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${SESSION_TTL_SEC}`,
  ].join("; ");

export const clearSessionCookie = () =>
  `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;

export const sessionCookieName = () => COOKIE_NAME;

/* ============================================================
   鉴权闸门（Next 风格）
   ------------------------------------------------------------
   每个 Route Handler 在函数开头：
     const auth = requireAuth(req);
     if (auth instanceof NextResponse) return auth;
     const me = auth; // PublicUser
   ============================================================ */

/**
 * 鉴权。sessionVersion 必须与库中的 version 一致。
 * 改密、重置、踢人都 bump —— 旧 token 立刻 401。
 *
 * @returns 通过则返回 User 对象；失败则直接返回 401 的 NextResponse，
 *          调用方 `if (auth instanceof NextResponse) return auth;` 早返。
 */
export function requireAuth(req: NextRequest): User | NextResponse {
  const ip = clientIp(req);
  const s = verifySession(readCookie(req, COOKIE_NAME));
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const user = findById(s.userId);
  if (!user || user.disabled) {
    noteSessionInvalid(ip, s.userId, {
      reason: !user ? "not_found" : "disabled",
    });
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (user.sessionVersion !== s.sessionVersion) {
    noteSessionInvalid(ip, s.userId, {
      reason: "session_version_stale",
      tokenVersion: s.sessionVersion,
      currentVersion: user.sessionVersion,
    });
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  return user;
}

/**
 * 管理员闸门：viewer 可以登录、浏览，但一切写操作都必须过这里。
 *
 * ⚠️ 这里只管**账号管理**（增删改用户、改角色）。
 * 照片与相册的权限不看角色，看 ownerId —— 见 requirePhotoOwner。
 */
export function requireAdmin(user: User): NextResponse | null {
  if (user.role !== "admin") {
    return NextResponse.json(
      { error: "forbidden", role: user.role },
      { status: 403 },
    );
  }
  return null;
}

/**
 * 资源归属闸门 —— 照片写操作的唯一权限依据。
 *
 * 刻意**不看 role**：管理员也只拥有自己的照片。
 *
 * @returns null 通过；NextResponse 表示拒绝，调用方早返。
 */
export function requirePhotoOwner(
  user: User,
  photo: { ownerId?: string } | undefined,
): NextResponse | null {
  if (!photo) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (photo.ownerId !== user.id) {
    return NextResponse.json({ error: "not_yours" }, { status: 403 });
  }
  return null;
}

/** 从常见反代头取 IP。失败回 local */
export function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "local"
  );
}
