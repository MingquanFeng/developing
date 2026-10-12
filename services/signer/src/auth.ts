import { createHmac, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import type { Context, Next } from "hono";
import { config, SESSION_TTL_SEC } from "./config";
import { findById, verifyCredentials, type User } from "./users";

const COOKIE_NAME = "album_session";

/* ============================================================
   令牌形如 <userId>.<过期ms>.<签名>
   带上 userId 是为了知道「是谁」，不再只是一个「已登录」的布尔值。
   无状态，服务重启不影响已登录会话。
   ============================================================ */

const hmac = (payload: string) =>
  createHmac("sha256", config.sessionSecret).update(payload).digest("hex");

export function issueSession(userId: string): string {
  const exp = Date.now() + SESSION_TTL_SEC * 1000;
  const payload = `${userId}.${exp}`;
  return `${payload}.${hmac(payload)}`;
}

export function verifySession(token: string | undefined): { userId: string } | null {
  if (!token) return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, exp, sig] = parts;

  const expected = hmac(`${userId}.${exp}`);
  if (sig.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  if (Number(exp) <= Date.now()) return null;

  return { userId };
}

/** 转发到 users.ts 的 SQLite 校验：用户名大小写不敏感 + bcrypt */
export const checkCredentials = verifyCredentials;

/* ---------- 登录失败节流 ---------- */

const attempts = new Map<string, { count: number; until: number }>();
const MAX_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;

const throttleKey = (ip: string, username: string) =>
  `${ip}|${username.toLowerCase()}`;

export function isLocked(ip: string, username: string): boolean {
  const a = attempts.get(throttleKey(ip, username));
  if (!a) return false;
  if (Date.now() > a.until) {
    attempts.delete(throttleKey(ip, username));
    return false;
  }
  return a.count >= MAX_ATTEMPTS;
}

export function noteFailure(ip: string, username: string) {
  const k = throttleKey(ip, username);
  const a = attempts.get(k) ?? { count: 0, until: 0 };
  if (Date.now() > a.until) a.count = 0;
  a.count += 1;
  a.until = Date.now() + LOCK_MS;
  attempts.set(k, a);
}

export function clearFailures(ip: string, username: string) {
  attempts.delete(throttleKey(ip, username));
}

/* ---------- Cookie ---------- */

export function readCookie(c: Context, name: string): string | undefined {
  const raw = c.req.header("cookie");
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

/* ---------- 中间件 ---------- */

declare module "hono" {
  interface ContextVariableMap {
    /** 已通过鉴权的用户，由 requireAuth 写入 */
    user: User;
  }
}

/** 挂在受保护路由前面 */
export async function requireAuth(c: Context, next: Next) {
  const s = verifySession(readCookie(c, COOKIE_NAME));
  if (!s) return c.json({ error: "unauthorized" }, 401);

  // 每次都回查一遍：用户可能刚被删掉或停用，令牌不会立刻失效
  const user = findById(s.userId);
  if (!user || user.disabled) {
    return c.json({ error: "unauthorized" }, 401);
  }

  c.set("user", user);
  await next();
}

/** 取当前用户，未鉴权时返回 null */
export const currentUser = (c: Context): User | undefined => c.get("user");