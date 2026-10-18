/**
 * 后台 API 错误处理
 * ------------------------------------------------------------------
 * 把网络错误 + 服务端 ApiError 统一翻成 Error；为登录这种复杂状态码
 * 提供人类可读的本地化映射。
 *
 * 设计原则：调用方只关心 catch (e) { e.message }，不需要关心响应形状。
 * 真正细节（hint、retryAfter）由本模块统一定夺。
 */
import type { ApiError } from "@/lib/contracts";

/** 浏览器原生 fetch 在离线/DNS 失败/服务没起时抛错的特征字符串 */
const NETWORK_ERROR_PATTERNS = [
  /Failed to fetch/,
  /NetworkError/,
  /Load failed/,
];

/** 当前 server 没起来时给运维的明确线索 */
export const NETWORK_DOWN_HINT =
  "连不上后端 —— 请确认 Next.js 进程正常运行，且 /api/* 路由没被改坏";

/** 判断一条错误消息是否是网络层问题 */
export function isNetworkError(msg: string): boolean {
  return NETWORK_ERROR_PATTERNS.some((re) => re.test(msg));
}

/**
 * 把 fetch 抛出的浏览器层异常（abort / 离线 / DNS / TLS / CORS）
 * 翻成本地化消息。
 *
 * 调用方约定"只 catch (e) { e.message }"——所以这里只产出 message，
 * 原始 cause 由 client.ts 的 console.error 留存，便于排错。
 */
export function networkErrorMessage(err: unknown): string {
  if (
    typeof DOMException !== "undefined" &&
    err instanceof DOMException &&
    err.name === "AbortError"
  ) {
    return "请求已取消";
  }
  const msg = err instanceof Error ? err.message : String(err);
  if (isNetworkError(msg)) {
    return "网络异常，连不上后端";
  }
  return "网络异常";
}

/** 由 ApiError 拼一句人类可读消息。如果带 detail 拼上去（detail 通常已含足够上下文） */
export function describeApiError(
  status: number,
  body: Partial<ApiError> = {},
  fallback?: string,
): string {
  switch (status) {
    case 401:
      return "用户名或密码不正确";
    case 403:
      return body.detail || body.error || "权限不足";
    case 404:
      return body.detail || body.error || "资源不存在";
    case 409:
      return body.detail || body.error || "版本冲突";
    case 429:
      return `尝试过多，已锁定，请 ${Math.round(
        (body.retryAfter ?? 900) / 60,
      )} 分钟后再试`;
    case 503:
      return body.hint === "no_users"
        ? "服务端还没有任何用户，请先在服务器执行 npm run user -- add <用户名>"
        : body.detail || body.error || "签名服务不可用";
    default:
      return (
        body.detail ||
        body.error ||
        fallback ||
        `HTTP 请求失败 ${status}`
      );
  }
}

/**
 * 统一把 fetch 失败 + ApiError 翻成 Error。
 *
 *   throw await asApiError(res, "保存清单")
 * 等价于：
 *   const body = await res.json().catch(() => ({}));
 *   throw new Error(describeApiError(res.status, body, "保存清单"))
 *
 * 多了对 fetch 自身抛错（如连不上）的归一化。
 */
export async function asApiError(
  res: Response,
  fallback?: string,
): Promise<never> {
  const body = (await res.json().catch(() => ({}))) as Partial<ApiError>;
  throw new Error(describeApiError(res.status, body, fallback));
}
