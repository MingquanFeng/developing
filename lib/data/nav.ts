/**
 * 导航与滚动定位数据
 * ------------------------------------------------------------------
 * nav 给顶部菜单；SECTION_IDS 给导航索引（"01 / 09"）和滚动监听用。
 *
 * SECTION_IDS 与 page.tsx 里九幕的 id 必须一一对应 —— 错一位就
 * 跳转定位会偏一屏。改这里必须同步检查 app/page.tsx 的 section id。
 */

/* ========== 导航 ========== */
/**
 * 顶导航的**内容项**（桌面 menu + 移动 drawer 共用这份）。
 *
 * ⚠️ 账户入口（登录 / 注册）不在这里 —— 那两项由 NavShell 按登录态
 * 条件渲染（me 有 → UserMenu 下拉；me 无 → 登录/注册按钮），后台
 * 不该改它们的显示逻辑，只改文案由 admin 自行决定去留。
 *
 * 动态化说明：本数组是**默认值与兜底**。后台改的是 SQLite 里的
 * 运行时覆盖值（lib/data/site-content.ts 的 getNav()），DB 没有才
 * 回落这里。
 */
export const nav = [
  { label: "作品", href: "#works" },
  { label: "故事", href: "#story" },
  { label: "手记", href: "#journal" },
  { label: "关于", href: "#about" },
  { label: "相册", href: "/album/" },
  { label: "联系", href: "#contact" },
] as const;

/**
 * 导航项允许的 href 形态 —— 既是类型守卫的依据，也是安全边界。
 *
 * 后台 admin 能改 href，如果无脑接受就能写 `javascript:alert(1)`：
 * React 的 href 属性**不阻止** javascript: URL（点击即执行）。
 * 所以 isNav 守卫按这个白名单校验：
 *   - `#anchor` —— 页内锚点，anchor 必须在已知 section id 里
 *   - `/path`   —— 站内绝对路径（单斜杠开头）
 *
 * `//evil.com` 开头的是协议相对 URL（指向外站），显式排除。
 */
export const NAV_ANCHORS = [
  "hero",
  "journal",
  "locations",
  "works",
  "story",
  "about",
  "contact",
] as const;

export type NavAnchor = (typeof NAV_ANCHORS)[number];

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
