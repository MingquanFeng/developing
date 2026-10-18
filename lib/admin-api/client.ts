/**
 * 后台客户端 fetch 包装
 * ------------------------------------------------------------------
 * 不做路径拼接，不做业务翻译，只把"同源 + cookies + JSON 请求体 + JSON 解析"
 * 这种重复样板集中到一处。业务模块（auth/manifest/...）拿到底层 `apiFetch`
 * 自己拼路径。
 *
 * ⚠️ 这一层**不**翻译业务错误（401/403/409 等）—— 那是
 * lib/admin-api/errors.ts 的事。本模块只 wrap fetch。
 *
 * credentials: "include" —— 后台需要把 session cookie 自动带上。
 * 早期 admin 用过 "same-origin"，但都自动带 cookie；统一 include 更明确。
 */
import { networkErrorMessage } from "./errors";

/** 共享默认 headers：JSON 请求体 + JSON 解析 + cookies */
export const API_BASE = "";

/**
 * 后台 fetch 主入口。
 *
 * - method 默认 "GET"
 * - 始终带 credentials: "include"
 * - 若 body 是对象，自动 JSON 化并加 content-type
 * - 不抛 OK 状态（业务模块自己处理）
 *
 * 浏览器层异常（abort / 离线 / DNS / TLS / CORS）的归一化：
 *   - 这些场景拿不到 Response，`asApiError` 跑不到，所以原 `TypeError`
 *     会原样冒到 UI（曾经显示成 "Failed to fetch"，对用户毫无线索）。
 *   - 这里统一翻成 readable message 由外层 catch (e) { e.message } 接管；
 *   - 原 cause 通过 console.error 留存，给排错用。
 *
 * `@returns` 原生 Response —— 业务模块决定怎么解读。
 */
export function apiFetch(
  path: string,
  init: Omit<RequestInit, "credentials" | "body"> & {
    body?: unknown;
  } = {},
): Promise<Response> {
  const headers: HeadersInit = {
    ...(init.headers ?? {}),
  };

  let body: BodyInit | undefined;
  if (init.body !== undefined && init.body !== null) {
    if (
      typeof init.body === "string" ||
      init.body instanceof FormData ||
      isBlobLike(init.body)
    ) {
      body = init.body as BodyInit;
    } else {
      body = JSON.stringify(init.body);
      (headers as Record<string, string>)["content-type"] = "application/json";
    }
  }

  return fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    headers,
    body,
  }).catch((err: unknown) => {
    const message = networkErrorMessage(err);
    /* console.warn 而不是 console.error —— Next.js 16 dev overlay 只对
       console.error 上报,避免每次浏览器侧 fetch throw (dev 编译期 transient
       throw 之类) 都触发错误浮层刷屏。原 cause 通过 Error.cause 字段带出,
       调用方 catch (e) { e.cause } 仍可拿到原 TypeError 排错。 */
    if (typeof console !== "undefined") {
      // eslint-disable-next-line no-console
      console.warn("[apiFetch]", path, "→", message, err);
    }
    throw new Error(message, { cause: err });
  });
}

/** 简易 Blob 判别（避免引入 instanceof 检查在 SSR 误报） */
function isBlobLike(x: unknown): boolean {
  return (
    typeof x === "object" &&
    x !== null &&
    typeof (x as { arrayBuffer?: unknown }).arrayBuffer === "function"
  );
}

/** 业务模块的 JSON 解析助手：ok 时返回 parsed，失败抛 ApiError */
export async function readJson<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}
