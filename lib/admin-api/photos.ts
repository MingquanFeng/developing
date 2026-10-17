/**
 * 后台单张照片 API
 * ------------------------------------------------------------------
 * 4 个端点，都在 /api/photo/[id] 路由族下：
 *
 *   PATCH /api/photo/[id]               —— 编辑（高频：isPublic 开关）
 *   DELETE /api/photo/[id]              —— 移入回收站
 *   POST /api/photo/[id]/restore        —— 从回收站恢复
 *   DELETE /api/photo/[id]/purge        —— 彻底删除（含 COS 对象）
 *
 * 编辑时只 patch 局部字段；isPublic 的开关走单张接口以避开
 * 整份清单乐观锁争用。其它字段（title / caption / place）走全清单
 * updateManifest，不在本模块。
 */
import { apiFetch, readJson } from "./client";
import { asApiError } from "./errors";
import type { Photo } from "@/lib/contracts";

/** PATCH /api/photo/[id] 响应：含服务端更新后的 photo 与新 revision */
export type PatchPhotoResponse = {
  photo: Photo;
  revision: number;
};

/**
 * 部分更新一张照片。
 *
 * @returns 返回新 photo 与 manifest revision —— 调用方用它们更新本地状态。
 *          "高频"场景（如 isPublic 切换）不需重新 fetchManifest。
 */
export async function patchPhoto(
  id: string,
  patch: Partial<Pick<Photo, "isPublic" | "title" | "caption" | "place">>,
): Promise<PatchPhotoResponse> {
  const r = await apiFetch(`/api/photo/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: patch,
  });
  if (!r.ok) await asApiError(r, "编辑照片失败");
  return await readJson<PatchPhotoResponse>(r);
}

/** 移入回收站（409 表乐观锁抖动，调用方按需重试整份 GET 后再删） */
export async function trashPhoto(id: string): Promise<void> {
  const r = await apiFetch(`/api/photo/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!r.ok && r.status !== 409) await asApiError(r, "移到回收站失败");
}

/** 从回收站恢复 */
export async function restorePhoto(id: string): Promise<void> {
  const r = await apiFetch(
    `/api/photo/${encodeURIComponent(id)}/restore`,
    { method: "POST" },
  );
  if (!r.ok) await asApiError(r, "恢复照片失败");
}

/** 彻底删除（含 COS 对象）。这是不可逆操作。 */
export async function purgePhoto(id: string): Promise<void> {
  const r = await apiFetch(
    `/api/photo/${encodeURIComponent(id)}/purge`,
    { method: "DELETE" },
  );
  if (!r.ok) await asApiError(r, "彻底删除失败");
}
