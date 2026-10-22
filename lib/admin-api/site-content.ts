/**
 * 后台首页内容 API
 * ------------------------------------------------------------------
 * 端点：
 *   GET    /api/site/content              —— 取全部 section（公开）
 *   GET    /api/site/content/meta         —— 取各 key 元信息（admin-only）
 *   GET    /api/site/content/versions     —— 取版本历史（admin-only）
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
  SiteContentVersion,
  SiteSectionKey,
} from "@/lib/contracts";

/** 与 listHomeContent() 同形态 —— 后台 UI 不再 import lib/data。
 *  类型用泛型，让调用方拿到精确形状（避免 any 蔓延）。 */
export type SiteContentDraft = {
  hero: unknown;
  about: unknown;
  subscribe: unknown;
  footer: unknown;
  story: unknown;
  nav: unknown;
  interlude01: unknown;
  interlude03: unknown;
  coords: unknown;
  worksIntro: unknown;
  site: unknown;
  series: unknown;
};

/** 公开 GET 响应：只 sections，不含 meta（meta 在 admin-only 端点）。 */
export type SiteContentResponse = {
  sections: SiteContentDraft;
};

/** admin GET meta 响应：meta 含 userId 等内部信息。 */
export type SiteContentMetaResponse = {
  meta: SiteContentMeta[];
};

/** admin GET versions 响应：版本流（追加写，旧版本永远留着）。 */
export type SiteContentVersionsResponse = {
  versions: SiteContentVersion[];
};

/** GET /api/site/content —— 拉 sections（公开） */
export async function fetchSiteContent(): Promise<SiteContentResponse> {
  const r = await apiFetch("/api/site/content", { cache: "no-store" });
  if (!r.ok) await asApiError(r, "获取首页内容失败");
  return await readJson<SiteContentResponse>(r);
}

/** GET /api/site/content/meta —— 拉 meta（admin-only） */
export async function fetchSiteContentMeta(): Promise<SiteContentMetaResponse> {
  const r = await apiFetch("/api/site/content/meta", { cache: "no-store" });
  if (!r.ok) await asApiError(r, "获取首页内容元信息失败");
  return await readJson<SiteContentMetaResponse>(r);
}

/** GET /api/site/content/versions —— 拉版本历史（admin-only）。
 *
 *  - 不带 key：返回全部 key 的版本（后台左栏要统计每个块的版本条数）
 *  - 带 key：只返回该 key 的版本
 */
export async function fetchSiteContentVersions(
  key?: SiteSectionKey,
): Promise<SiteContentVersionsResponse> {
  const qs = key ? `?key=${encodeURIComponent(key)}` : "";
  const r = await apiFetch(`/api/site/content/versions${qs}`, {
    cache: "no-store",
  });
  if (!r.ok) await asApiError(r, "获取内容版本历史失败");
  return await readJson<SiteContentVersionsResponse>(r);
}

/** PUT /api/site/content/[key] —— 保存一节。
 *  - content 的精确类型由各 section editor 决定（hero/about/...）。
 *  - 服务端会做结构校验；不通过 → 抛 ApiError（带 detail）。
 *  - basedOnId：这个新版本是从哪一版改下来的。省略 = 从当前版本改。
 *    恢复历史版本时传那个版本的 id，服务端据此把版本链串起来。 */
export async function saveSiteSection<K extends SiteSectionKey>(
  key: K,
  content: SectionContent<K>,
  basedOnId?: number | null,
): Promise<{ key: K; updatedAt: string; versionId: number }> {
  const r = await apiFetch(`/api/site/content/${encodeURIComponent(key)}`, {
    method: "PUT",
    body:
      basedOnId === undefined || basedOnId === null
        ? { content }
        : { content, basedOnId },
  });
  if (!r.ok) await asApiError(r, `保存 ${key} 内容失败`);
  return await readJson<{
    key: K;
    updatedAt: string;
    versionId: number;
  }>(r);
}

/** DELETE /api/site/content/[key] —— 重置一节为静态默认。
 *  服务端会追加一条「重置」版本（历史不丢）。 */
export async function resetSiteSection(
  key: SiteSectionKey,
): Promise<{ key: SiteSectionKey; reset: true; versionId: number }> {
  const r = await apiFetch(
    `/api/site/content/${encodeURIComponent(key)}`,
    { method: "DELETE" },
  );
  if (!r.ok) await asApiError(r, `重置 ${key} 失败`);
  return await readJson<{
    key: SiteSectionKey;
    reset: true;
    versionId: number;
  }>(r);
}