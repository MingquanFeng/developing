/**
 * 第 01 幕 —— 首屏 HERO
 * ------------------------------------------------------------------
 * 满屏肖像 + 大字标题 + 四栏元信息。section id="hero" 是导航定位
 * 与 SECTION_IDS 计数的锚点。
 *
 * 数据来源：`app/page.tsx` 通过 listHomeContent() 异步拉取（DB 覆盖
 * 或静态兜底）。本组件只负责透传 —— 不直接 import lib/data。
 */
import Hero from "@/components/Hero";
import type { hero } from "@/lib/data/home";

export default function HeroSection({ data }: { data: typeof hero }) {
  return <Hero data={data} />;
}