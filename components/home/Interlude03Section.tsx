/**
 * 第 06 幕 —— 手记 03 / 工作方法
 * ------------------------------------------------------------------
 * 浅色留白 + 大留白 + 小字体的"minimal"变体 Interlude。
 * 与 JournalSection 共享 Interlude 组件但走不同 props，故拆两个文件。
 */
import Interlude from "@/components/Interlude";
import { interlude03 } from "@/lib/data/home";

export default function Interlude03Section() {
  return (
    <Interlude
      kicker={interlude03.kicker}
      lines={interlude03.quote}
      small
      variant="minimal"
    />
  );
}
