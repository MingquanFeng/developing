/**
 * 首页内容数据源 —— async 路径（首期 5 section）
 * ------------------------------------------------------------------
 * 提供：
 *   - 5 个 section 的 async helper（getHero/getAbout/getSubscribe/getFooter/getStory）
 *   - 一次性聚合 listHomeContent() —— 给 app/page.tsx 一次拉齐
 *   - seed 函数（首次启动把 lib/data 静态值喂给 SQLite）
 *
 * 与 lib/data/*.ts 同步常量的关系：
 *   - 同步常量 (`hero` / `about` / `subscribe` / `footer` / `story`) 是默认值与兜底
 *   - 这里只接 DB；DB 没有 → 回落静态
 *
 * 老 `import { hero } from "@/lib/data"` 仍可用（向后兼容）；新代码请走
 * `import { getHero, listHomeContent } from "@/lib/data/site-content"`。
 */
import {
  hero,
  interlude01,
  interlude03,
  coords,
  worksIntro,
} from "./home";
import { about } from "./about";
import { subscribe } from "./subscribe";
import { footer } from "./footer";
import { story } from "./story";
import { nav } from "./nav";
import { site } from "./site";
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
  story: typeof story;
  nav: typeof nav;
  interlude01: typeof interlude01;
  interlude03: typeof interlude03;
  coords: typeof coords;
  worksIntro: typeof worksIntro;
  /** 站点 meta 的可编辑部分（不含 locale） */
  site: Omit<typeof site, "locale">;
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
export async function getStory(): Promise<typeof story> {
  return (getSiteSection<typeof story>("story") ?? story) as typeof story;
}
export async function getNav(): Promise<typeof nav> {
  return (getSiteSection<typeof nav>("nav") ?? nav) as typeof nav;
}
export async function getInterlude01(): Promise<typeof interlude01> {
  return (
    getSiteSection<typeof interlude01>("interlude01") ?? interlude01
  ) as typeof interlude01;
}
export async function getInterlude03(): Promise<typeof interlude03> {
  return (
    getSiteSection<typeof interlude03>("interlude03") ?? interlude03
  ) as typeof interlude03;
}
export async function getCoords(): Promise<typeof coords> {
  return (getSiteSection<typeof coords>("coords") ?? coords) as typeof coords;
}
export async function getWorksIntro(): Promise<typeof worksIntro> {
  return (
    getSiteSection<typeof worksIntro>("worksIntro") ?? worksIntro
  ) as typeof worksIntro;
}

/**
 * 站点 meta（可编辑部分，不含 locale）。
 * locale 保持静态 —— 见 lib/contracts.ts 的 SiteContentData 注释。
 */
export async function getSiteMeta(): Promise<Omit<typeof site, "locale">> {
  const fallback: Omit<typeof site, "locale"> = {
    name: site.name,
    nameEn: site.nameEn,
    title: site.title,
    description: site.description,
    projectName: site.projectName,
    edition: site.edition,
    foundedYear: site.foundedYear,
    cities: [...site.cities],
    marquee: [...site.marquee],
  };
  return (
    getSiteSection<Omit<typeof site, "locale">>("site") ?? fallback
  ) as Omit<typeof site, "locale">;
}

/** 一次拉齐 11 个 section（page.tsx 用） */
export async function listHomeContent(): Promise<SiteContent> {
  const [
    h,
    a,
    s,
    f,
    st,
    nv,
    i01,
    i03,
    co,
    wi,
    sm,
  ] = await Promise.all([
    getHero(),
    getAbout(),
    getSubscribe(),
    getFooter(),
    getStory(),
    getNav(),
    getInterlude01(),
    getInterlude03(),
    getCoords(),
    getWorksIntro(),
    getSiteMeta(),
  ]);
  return {
    hero: h,
    about: a,
    subscribe: s,
    footer: f,
    story: st,
    nav: nv,
    interlude01: i01,
    interlude03: i03,
    coords: co,
    worksIntro: wi,
    site: sm,
  };
}

/* ============================================================
   首次启动 seed —— 把 lib/data 静态值写入 SQLite
   ------------------------------------------------------------
   被 lib/signer/users.ts 的 migrate 末尾调用，仅当 site_content 表
   为空时执行（不覆盖已有覆盖值）。
   ============================================================ */
export function seedHomeContentFromDefaults(): void {
  seedSiteContentIfEmpty({
    hero,
    about,
    subscribe,
    footer,
    story,
    nav: [...nav],
    interlude01,
    interlude03,
    coords,
    worksIntro,
    /* locale 刻意不种 —— 它不进 DB */
    site: {
      name: site.name,
      nameEn: site.nameEn,
      title: site.title,
      description: site.description,
      projectName: site.projectName,
      edition: site.edition,
      foundedYear: site.foundedYear,
      cities: [...site.cities],
      marquee: [...site.marquee],
    },
  });
}

/* ============================================================
   类型兼容 —— 显式声明 SiteSectionKey 在这里 re-export
   ============================================================ */
export type { SiteSectionKey };