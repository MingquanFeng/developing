/**
 * 导航与滚动定位数据
 * ------------------------------------------------------------------
 * nav 给顶部菜单；SECTION_IDS 给导航索引（"01 / 09"）和滚动监听用。
 *
 * SECTION_IDS 与 page.tsx 里九幕的 id 必须一一对应 —— 错一位就
 * 跳转定位会偏一屏。改这里必须同步检查 app/page.tsx 的 section id。
 */

/* ========== 导航 ========== */
export const nav = [
  { label: "作品", href: "#works" },
  { label: "故事", href: "#story" },
  { label: "手记", href: "#journal" },
  { label: "关于", href: "#about" },
  { label: "相册", href: "/album/" },
  { label: "联系", href: "#contact" },
  /* 账户入口。登录跳后台口令页；注册开放自助，账号为访客 */
  { label: "登录", href: "/admin/" },
  { label: "注册", href: "/register/" },
] as const;

/* ========== 章节顺序（用于导航索引计数） ========== */
export const SECTION_IDS = [
  "hero",
  "journal",
  "locations",
  "works",
  "story",
  "about",
  "contact",
] as const;
