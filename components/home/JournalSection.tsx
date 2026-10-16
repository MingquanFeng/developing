/**
 * 第 02 幕 —— 手记 01 / 关于面孔（journal 锚点）
 * ------------------------------------------------------------------
 * 浅色留白 + 逐行遮罩揭幕的引文。id="journal" 必须与 SECTION_IDS
 * 对齐（lib/data/nav.ts），改其一要同步另一。
 */
import Interlude from "@/components/Interlude";
import { interlude01 } from "@/lib/data/home";

export default function JournalSection() {
  return (
    <Interlude
      id="journal"
      kicker={interlude01.kicker}
      lines={interlude01.quote}
      emphasisIndex={interlude01.emphasisIndex}
      sig={interlude01.sig}
    />
  );
}
