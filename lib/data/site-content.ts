/**
 * 首页内容数据源 —— async 路径（首期 4 section）
 * ------------------------------------------------------------------
 * 提供：
 *   - 4 个 section 的 async helper（getHero/getAbout/getSubscribe/getFooter）
 *   - 一次性聚合 listHomeContent() —— 给 app/page.tsx 一次拉齐
 *   - seed 函数（首次启动把 lib/data 静态值喂给 SQLite）
 *
 * 与 lib/data/*.ts 同步常量的关系：
 *   - 同步常量 (`hero` / `about` / `subscribe` / `footer`) 是默认值与兜底
 *   - 这里只接 DB；DB 没有 → 回落静态
 *
 * 老 `import { hero } from "@/lib/data"` 仍可用（向后兼容）；新代码请走
 * `import { getHero, listHomeContent } from "@/lib/data/site-content"`。
 */
import { hero } from "./home";
import { about } from "./about";
import { subscribe } from "./subscribe";
import { footer } from "./footer";
import {
  getSiteSection,
  seedSiteContentIfEmpty,
  type SiteSectionKey,
} from "@/lib/signer/site-content";

export type SiteContent = {
  hero: typeof hero;
  about: typeof about;
  subscribe: typeof subscribe;
  footer: typeof footer;
};

/** 首页 SSR：DB 有就用，没有回落静态 */
export async function getHero(): Promise<typeof hero> {
  return (getSiteSection<typeof hero>("hero") ?? hero) as typeof hero;
}
export async function getAbout(): Promise<typeof about> {
  return (getSiteSection<typeof about>("about") ?? about) as typeof about;
}
export async function getSubscribe(): Promise<typeof subscribe> {
  return (
    getSiteSection<typeof subscribe>("subscribe") ?? subscribe
  ) as typeof subscribe;
}
export async function getFooter(): Promise<typeof footer> {
  return (getSiteSection<typeof footer>("footer") ?? footer) as typeof footer;
}

/** 一次拉齐 4 个 section（page.tsx 用） */
export async function listHomeContent(): Promise<SiteContent> {
  const [h, a, s, f] = await Promise.all([
    getHero(),
    getAbout(),
    getSubscribe(),
    getFooter(),
  ]);
  return { hero: h, about: a, subscribe: s, footer: f };
}

/* ============================================================
   首次启动 seed —— 把 lib/data 静态值写入 SQLite
   ------------------------------------------------------------------
   被 lib/signer/users.ts 的 migrate 末尾调用，仅当 site_content 表
   为空时执行（不覆盖已有覆盖值）。
   ============================================================ */
export function seedHomeContentFromDefaults(): void {
  seedSiteContentIfEmpty({ hero, about, subscribe, footer });
}

/* ============================================================
   类型兼容 —— 显式声明 SiteSectionKey 在这里 re-export
   ============================================================ */
export type { SiteSectionKey };