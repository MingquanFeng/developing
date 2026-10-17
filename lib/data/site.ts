/**
 * 站点级数据
 * ------------------------------------------------------------------
 * 站点元信息：名字、简介、版本、城市。layout.tsx 的 metadata 用 site.*
 * 拼接，Nav 与 Footer 也会读 site.name。
 */

export const site = {
  name: "塞上空许",
  nameEn: "YAN",
  title: "塞上空许 — 至静之极",
  description:
    "塞上空许 — 先锋人像摄影师，工作于上海、北京、大理。一份关于面孔、凝视与沉默的视觉志。",
  locale: "zh-CN",
  projectName: "developing",
  edition: 47,
  foundedYear: 2014,
  cities: ["上海", "北京", "大理"],
  marquee: [
    "塞上空许工作室 — 上海 ↔ 北京 ↔ 大理",
    "人像志 · 卷 47",
  ],
} as const;
