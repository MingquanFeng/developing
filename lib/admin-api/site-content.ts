/**
 * 后台首页内容 API
 * ------------------------------------------------------------------
 * 端点：
 *   GET    /api/site/content              —— 取全部 section（公开）
 *   PUT    /api/site/content/[key]        —— 写入一节（admin）
 *   DELETE /api/site/content/[key]        —— 重置一节为静态默认（admin）
 *
 * 与 listUsers / saveSiteSection 模式对齐：错误由调用方 try/catch 接管
 * （asApiError 已经在 server 侧把状态码转成人话）。
 *
 * `saveSiteSection<K>` 的第二个参数是精确的 SectionContent<K>，让调用方
 * 在编译期就被拒错形状（DB 还会再校一道，但不光靠 DB）。
 */
import { apiFetch, readJson } from "./client";
import { asApiError } from "./errors";
import type {
  SectionContent,
  SiteContentMeta,
  SiteSectionKey,
} from "@/lib/contracts";

/** 与 listHomeContent() 同形态 —— 后台 UI 不再 import lib/data。
 *  类型用泛型，让调用方拿到精确形状（避免 any 蔓延）。 */
export type SiteContentDraft = {
  hero: unknown;
  about: unknown;
  subscribe: unknown;
  footer: unknown;
};

export type SiteContentResponse = {
  sections: SiteContentDraft;
  meta: SiteContentMeta[];
};

/** GET /api/site/content —— 后台首屏拉数据初始化表单 */
export async function fetchSiteContent(): Promise<SiteContentResponse> {
  const r = await apiFetch("/api/site/content", { cache: "no-store" });
  if (!r.ok) await asApiError(r, "获取首页内容失败");
  return await readJson<SiteContentResponse>(r);
}

/** PUT /api/site/content/[key] —— 保存一节。
 *  - content 的精确类型由各 section editor 决定（hero/about/...）。
 *  - 服务端会做结构校验；不通过 → 抛 ApiError（带 detail）。 */
export async function saveSiteSection<K extends SiteSectionKey>(
  key: K,
  content: SectionContent<K>,
): Promise<{ key: K; updatedAt: string }> {
  const r = await apiFetch(`/api/site/content/${encodeURIComponent(key)}`, {
    method: "PUT",
    body: { content },
  });
  if (!r.ok) await asApiError(r, `保存 ${key} 内容失败`);
  return await readJson<{ key: K; updatedAt: string }>(r);
}

/** DELETE /api/site/content/[key] —— 重置一节为静态默认 */
export async function resetSiteSection(
  key: SiteSectionKey,
): Promise<void> {
  const r = await apiFetch(
    `/api/site/content/${encodeURIComponent(key)}`,
    { method: "DELETE" },
  );
  if (!r.ok) await asApiError(r, `重置 ${key} 失败`);
}