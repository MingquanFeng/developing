/**
 * 后台上传签名 API
 * ------------------------------------------------------------------
 * POST /api/sign —— 批量拿 COS 预签名 PUT URL。
 *
 * 入参 files 最多 50 个（服务端限制）；出参 items 与入参按顺序一一对应。
 *
 * 调用方拿到 url 后用 XMLHttpRequest 直接 PUT 文件到 COS（不是 admin-api 的
 * 职责），进度通过 XHR.upload.onprogress 拿到 —— 这就是 upload-queue.ts
 * 为什么用 XHR 而非 fetch 的原因。本模块只负责签名 URL 这一步。
 *
 * ⚠️ 拿到 url 后**不要**把它们缓存 —— COS 签名 URL 默认 30 分钟有效，
 *    缓存超过这个时间后会签名失败。
 */
import { apiFetch, readJson } from "./client";
import { asApiError } from "./errors";

const MAX_FILES_PER_BATCH = 50;

export type SignRequestFile = {
  name: string;
  size: number;
  type: string;
};

export type SignResponseItem = {
  /** COS 对象键（之后写元数据用的 key） */
  key: string;
  /** 预签名 PUT URL —— XHR PUT 到这 */
  url: string;
};

/**
 * 拿一批签名 URL。
 *
 * @param files 元数据按顺序一一对应服务端的 items。
 *              >50 个时会被截断；调用方应保证每次调用不超过 50 个。
 */
export async function presignUpload(
  files: readonly SignRequestFile[],
): Promise<SignResponseItem[]> {
  if (files.length > MAX_FILES_PER_BATCH) {
    throw new Error(
      `一次最多 ${MAX_FILES_PER_BATCH} 个文件，请分批调用 presignUpload`,
    );
  }
  const r = await apiFetch("/api/sign", {
    method: "POST",
    body: { files: files.map((f) => ({ ...f })) },
  });
  if (!r.ok) await asApiError(r, "取签名失败");
  const { items } = await readJson<{ items: SignResponseItem[] }>(r);
  return items;
}

/** 上限供上传队列分批用 */
export const SIGN_BATCH_LIMIT = MAX_FILES_PER_BATCH;
