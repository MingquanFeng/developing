/**
 * 第 05 幕 —— 主推故事（静蓝）
 * ------------------------------------------------------------------
 * 满屏影像 + 斜体英文副标 + 阅读入口 + 四栏元信息。section id="story"。
 *
 * 数据来源：`app/page.tsx` 通过 listHomeContent() 异步拉取。本组件
 * 只负责透传 —— 不直接 import lib/data。
 */
import Story from "@/components/Story";
import type { story } from "@/lib/data/story";

export default function StorySection({ data }: { data: typeof story }) {
  return <Story data={data} />;
}