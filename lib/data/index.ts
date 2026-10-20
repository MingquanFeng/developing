/**
 * 站点内容数据源 —— barrel
 * ------------------------------------------------------------------
 * 历史 `import { site, nav, series, ... } from "@/lib/data"` 继续可用。
 * 新代码可按域精确 import：
 *
 *   import { site } from "@/lib/data/site";
 *   import { nav, SECTION_IDS } from "@/lib/data/nav";
 *   import { series, worksIntro, FALLBACK_IMAGES } from "@/lib/data/home";
 *   import { story } from "@/lib/data/story";
 *   import { about } from "@/lib/data/about";
 *   import { subscribe } from "@/lib/data/subscribe";
 *   import { footer } from "@/lib/data/footer";
 *
 * 首期动态化：hero / about / subscribe / footer 4 个 section 已有后台编辑。
 * 异步拉取走新模块：
 *
 *   import { listHomeContent, getHero } from "@/lib/data/site-content";
 *
 * 拆分是物理迁移，零行为变化；下个 PR（PR-6）会顺一次把老 import
 * 都迁到精确路径。
 */

export { site } from "./site";
export { nav, SECTION_IDS } from "./nav";
export {
  hero,
  interlude01,
  interlude03,
  series,
  worksIntro,
  coords,
  FALLBACK_IMAGES,
} from "./home";
export { story } from "./story";
export { about } from "./about";
export { subscribe } from "./subscribe";
export { footer } from "./footer";
