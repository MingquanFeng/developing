/**
 * 第 06 幕 —— 手记 03 / 工作方法
 * ------------------------------------------------------------------
 * 浅色留白 + 大留白 + 小字体的"minimal"变体 Interlude。
 * 与 JournalSection 共享 Interlude 组件但走不同 props，故拆两个文件。
 *
 * 数据来源：`app/page.tsx` 通过 listHomeContent() 异步拉取。本组件
 * 只负责透传 —— 不直接 import lib/data。
 */
import Interlude from "@/components/Interlude";
import type { interlude03 } from "@/lib/data/home";

export default function Interlude03Section({
  data,
}: {
  data: typeof interlude03;
}) {
  return (
    <Interlude
      kicker={data.kicker}
      lines={data.quote}
      small
      variant="minimal"
    />
  );
}