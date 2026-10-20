/**
 * 第 07 幕 —— 关于摄影师（ABOUT）
 * ------------------------------------------------------------------
 * 浅色双栏 + 委托肖像 CTA。section id="about"。
 *
 * 数据来源：`app/page.tsx` 通过 listHomeContent() 异步拉取。本组件
 * 只负责透传 —— 不直接 import lib/data。
 */
import About from "@/components/About";
import type { about } from "@/lib/data/about";

export default function AboutSection({ data }: { data: typeof about }) {
  return <About data={data} />;
}