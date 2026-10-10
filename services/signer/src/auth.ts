import { createHmac, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import type { Context, Next } from "hono";
import { config, SESSION_TTL_SEC } from "./config";

const COOKIE_NAME = "album_session";

/** 会话签名密钥：优先 SESSION_SECRET，否则从口令哈希派生 */
function secret(): string {
  return config.sessionSecret || `derived:${config.passwordHash}`;
}

const hmac = (payload: string) =>
  createHmac("sha256", secret()).update(payload).digest("hex");

/** 令牌形如 `<过期时间戳>.<签名>`，无状态，服务重启不影响 */
export function issueSession(): string {
  const exp = Date.now() + SESSION_TTL_SEC * 1000;
  return `${exp}.${hmac(String(exp))}`;
}

export function verifySession(token: string | undefined): boolean {
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot < 0) return false;

  const exp = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  const expected = hmac(exp);
  if (sig.length !== expected.length) return false;
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;

  return Number(exp) > Date.now();
}

export async function checkPassword(plain: string): Promise<boolean> {
  if (!config.passwordHash) return false;
  return bcrypt.compare(plain, config.passwordHash);
}

/* ---------- 登录失败节流 ---------- */

const attempts = new Map<string, { count: number; until: number }>();
const MAX_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;

export function isLocked(ip: string): boolean {
  const a = attempts.get(ip);
  if (!a) return false;
  if (Date.now() > a.until) {
    attempts.delete(ip);
    return false;
  }
  return a.count >= MAX_ATTEMPTS;
}

export function noteFailure(ip: string) {
  const a = attempts.get(ip) ?? { count: 0, until: 0 };
  if (Date.now() > a.until) a.count = 0;
  a.count += 1;
  a.until = Date.now() + LOCK_MS;
  attempts.set(ip, a);
}

export function clearFailures(ip: string) {
  attempts.delete(ip);
}

/* ---------- 中间件 ---------- */

export function readCookie(c: Context, name: string): string | undefined {
  const raw = c.req.header("cookie");
  if (!raw) return undefined;
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

export function setSessionCookie(token: string) {
  return [
    `${COOKIE_NAME}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${SESSION_TTL_SEC}`,
  ].join("; ");
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
}

export function sessionCookieName() {
  return COOKIE_NAME;
}

/** 挂在受保护路由前面 */
export async function requireAuth(c: Context, next: Next) {
  if (!verifySession(readCookie(c, COOKIE_NAME))) {
    return c.json({ error: "unauthorized" }, 401);
  }
  await next();
}