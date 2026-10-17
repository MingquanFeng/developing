/**
 * 后台清单 API
 * ------------------------------------------------------------------
 * GET /api/album —— 拿当前 manifest（含 revision）
 * PUT /api/album —— 写回整份 manifest，带乐观锁
 *
 * 写失败 409 时需要自动拉一次最新 manifest 重试。重复上限 3 次
 * （与 AdminApp 原行为一致）—— 两端同时改时这种抖动是偶发的，
 * 3 次足以解决；如果还失败说明服务真的有并发问题，告知调用方。
 */
import { apiFetch, readJson } from "./client";
import { asApiError } from "./errors";
import type { Album, Manifest, Photo } from "@/lib/contracts";

const MAX_REVISION_RETRIES = 3;

export async function fetchManifest(): Promise<Manifest> {
  const r = await apiFetch("/api/album", { cache: "no-store" });
  if (!r.ok) {
    const msg = await r.text().catch(() => `HTTP ${r.status}`);
    throw new Error(`获取清单失败：${msg}`);
  }
  const data = (await readJson<Partial<Manifest>>(r)) ?? {};
  return {
    revision: Number(data.revision ?? 0),
    updatedAt: data.updatedAt ?? "",
    albums: Array.isArray(data.albums) ? data.albums : [],
    photos: Array.isArray(data.photos) ? data.photos : [],
  };
}

export type ManifestDraft = {
  revision: number;
  albums: Album[];
  photos: Photo[];
};

/**
 * 写整份清单，乐观锁。
 *
 * 成功：返回服务端确认的 revision / updatedAt（调用方用它更新本地 Manifest）。
 * 失败：
 *   - 409 stale_revision 自动重试最多 3 次（拉最新 revision 再覆盖）
 *   - 其它错误透传：throw Error
 */
export async function updateManifest(
  draft: ManifestDraft,
): Promise<{ revision: number; updatedAt: string }> {
  for (let attempt = 0; attempt < MAX_REVISION_RETRIES; attempt++) {
    const res = await apiFetch("/api/album", {
      method: "PUT",
      body: draft,
    });

    if (res.ok) {
      return await readJson<{ revision: number; updatedAt: string }>(res);
    }
    if (res.status === 409) {
      // 服务端版本更新了 —— 拉一次最新，bump revision 后再覆盖
      const cur = await fetchManifest();
      draft = { ...draft, revision: cur.revision };
      continue;
    }
    await asApiError(res, "保存清单失败");
  }
  throw new Error(`保存冲突，重试 ${MAX_REVISION_RETRIES} 次仍未成功`);
}
