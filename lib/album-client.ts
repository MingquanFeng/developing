/**
 * 相册清单的数据源
 * ------------------------------------------------------------------
 * Next.js 进程是单进程：`/api/*` 由 Next.js Route Handler 提供，
 * 与前端同源。所有请求走相对路径即可，不再需要任何 base URL 环境变量。
 *
 * 站点两条取清单的路径：
 *
 *   1. 构建期：next build 时取一次，烘进 index.html
 *      → 首屏直接有图，不用等 JS；SEO 也能抓到
 *   2. 运行时：页面加载后再取一次
 *      → 新上传的照片刷新就能看到，不必重新构建部署
 */

import type { Album, Photo, ResetLinkResponse as ResetLinkResponseContract } from "@/lib/contracts";
import type { PublicUser as PublicUserContract, Manifest as ManifestContract } from "@/lib/contracts";

/** @deprecated 本地历史别名。直接 import from "@/lib/contracts" */
export type PublicUser = PublicUserContract;
/** @deprecated 本地历史别名。直接 import from "@/lib/contracts" */
export type Manifest = ManifestContract;
/** @deprecated 直接 import from "@/lib/contracts" */
export type ResetLinkResponse = ResetLinkResponseContract;

export const EMPTY: Manifest = {
  revision: 0,
  updatedAt: "",
  albums: [],
  photos: [],
};

/* ============================================================
   路径与基址（同源后是空操作）
   ------------------------------------------------------------
   保留 `signerBase` / `signerEndpoint` 是为了兼容旧调用方；
   现在它们返回 `""`，拼出 `/api/...` 相对路径。
   如果以后真的要切到外部后端，只改这里。
   ============================================================ */

/** 永远返回 `""` —— 同源。 */
export function signerBase(): string {
  return "";
}

/** 永远返回原 path 自身。 */
export function signerEndpoint(path: string): string {
  return path;
}

export async function fetchManifest(signal?: AbortSignal): Promise<Manifest> {
  const res = await fetch("/api/album", {
    cache: "no-store",
    signal,
    credentials: "same-origin",
  });
  if (!res.ok) throw new Error(`清单接口返回 HTTP ${res.status}`);

  const data = (await res.json()) as Partial<Manifest>;
  return {
    revision: Number(data.revision ?? 0),
    updatedAt: data.updatedAt ?? "",
    albums: Array.isArray(data.albums) ? data.albums : [],
    photos: Array.isArray(data.photos) ? data.photos : [],
  };
}

/* ---------- 签名读 URL ---------- */

export type Variant = "thumb" | "preview" | "original";

/**
 * 签名 URL 约 15 分钟后过期，所以**必须缓存并提前重取**。
 * 缓存 key 用 photoId + variant，不含时间戳 —— 否则每次渲染都是新请求。
 */
const urlCache = new Map<string, { url: string; at: number }>();

/** 提前 3 分钟换新，留出图片还没加载完的余量 */
const REFRESH_BEFORE_MS = 3 * 60 * 1000;
const TTL_MS = 15 * 60 * 1000;

export async function fetchPhotoUrl(
  photoId: string,
  variant: Variant = "preview",
): Promise<string | null> {
  const k = `${photoId}:${variant}`;
  const hit = urlCache.get(k);
  if (hit && Date.now() - hit.at < TTL_MS - REFRESH_BEFORE_MS) return hit.url;

  try {
    const res = await fetch(`/api/photo/${photoId}/url?v=${variant}`, {
      credentials: "same-origin",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { url?: string };
    if (!data.url) return null;
    urlCache.set(k, { url: data.url, at: Date.now() });
    return data.url;
  } catch {
    return null;
  }
}

/** 切换账户后必须清空，否则会拿到上一个用户的签名 URL */
export const clearUrlCache = () => urlCache.clear();

/* ============================================================
   账号管理接口（全部走相对路径）
   ============================================================ */

/** 把服务端错误码翻成人话，跟 RegisterForm / AccountForm 风格一致 */
function explainAccount(code: string, detail?: string): string {
  switch (code) {
    case "wrong_current_password":
      return "当前密码不正确。";
    case "invalid_input":
      return detail ?? "请检查填写的内容。";
    case "token_not_found":
      return "链接无效或已被吊销。";
    case "token_used":
      return "此链接已被使用，请重新申请。";
    case "token_expired":
      return "此链接已过期（24h 内有效），请联系管理员重新申请。";
    case "cannot_revoke_self":
      return "不能吊销自己的会话。";
    case "user_disabled":
      return "此账号已被停用。";
    case "last_admin":
      return "至少要保留一个管理员。";
    case "not_found":
      return "用户不存在。";
    default:
      return "操作失败，请稍后再试。";
  }
}

async function callAccount(
  path: string,
  init: RequestInit & { body?: string },
): Promise<Response> {
  return fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
}

export async function changeOwnPassword(
  currentPassword: string,
  newPassword: string,
): Promise<PublicUser> {
  const r = await callAccount("/api/account/password", {
    method: "POST",
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  const data = (await r.json().catch(() => ({}))) as {
    error?: string;
    detail?: string;
    user?: PublicUser;
  };
  if (!r.ok || !data.user) {
    throw new Error(explainAccount(data.error || "", data.detail));
  }
  return data.user;
}

export async function resetPasswordWithToken(
  token: string,
  newPassword: string,
): Promise<void> {
  const r = await callAccount("/api/account/reset", {
    method: "POST",
    body: JSON.stringify({ token, newPassword }),
  });
  const data = (await r.json().catch(() => ({}))) as {
    error?: string;
    detail?: string;
  };
  if (!r.ok) {
    throw new Error(explainAccount(data.error || "", data.detail));
  }
}

export async function generateResetLink(
  userId: string,
): Promise<ResetLinkResponse> {
  const r = await callAccount(`/api/users/${userId}/reset-link`, {
    method: "POST",
  });
  const data = (await r.json().catch(() => ({}))) as ResetLinkResponse & {
    error?: string;
    detail?: string;
  };
  if (!r.ok || !("url" in data)) {
    throw new Error(explainAccount(data.error || "", data.detail));
  }
  return data;
}

export async function revokeUserSessions(userId: string): Promise<void> {
  const r = await callAccount(`/api/users/${userId}/sessions/revoke`, {
    method: "POST",
  });
  const data = (await r.json().catch(() => ({}))) as {
    error?: string;
    detail?: string;
  };
  if (!r.ok) {
    throw new Error(explainAccount(data.error || "", data.detail));
  }
}
