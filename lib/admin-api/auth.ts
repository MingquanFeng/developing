/**
 * 后台会话 API
 * ------------------------------------------------------------------
 * 三个端点：
 *   GET  /api/session     —— 探测当前会话，返回 { user?: PublicUser }
 *   POST /api/login       —— 登录，返回 { user: PublicUser }
 *   POST /api/logout      —— 退出，无 body
 *
 * 注意：登录失败的 401/429/503 翻译已迁到 lib/admin-api/errors.ts；
 * 本模块只暴露 happy-path 与 throw 错误。
 */
import { apiFetch, readJson } from "./client";
import { asApiError } from "./errors";
import type { PublicUser } from "@/lib/contracts";

export type SessionResponse = { user: PublicUser | null };

/** 探测当前会话。返回 user=null 表示未登录；网络错误会冒泡。 */
export async function fetchSession(): Promise<PublicUser | null> {
  const r = await apiFetch("/api/session");
  if (!r.ok) return null;
  const d = await readJson<SessionResponse>(r).catch(() => ({ user: null }));
  return d.user ?? null;
}

/**
 * 登录。
 *
 * 成功：返回 user。
 * 失败：抛 Error；message 是人类可读的中文（401 用户名密码错 / 429 锁定 N 分钟 /
 *        503 签名服务不可用 / 503+hint=no_users 服务无用户）。
 */
export async function loginSession(
  username: string,
  password: string,
): Promise<PublicUser> {
  const r = await apiFetch("/api/login", {
    method: "POST",
    body: { username, password },
  });
  if (!r.ok) await asApiError(r, "登录失败");
  const d = await readJson<{ user?: PublicUser }>(r);
  if (!d.user) throw new Error("登录响应无 user");
  return d.user;
}

/** 退出登录。网络错误吞掉（用户操作上等价于已退出）。 */
export async function logoutSession(): Promise<void> {
  await apiFetch("/api/logout", { method: "POST" }).catch(() => {});
}
