/**
 * 第 02 幕 —— 手记 01 / 关于面孔（journal 锚点）
 * ------------------------------------------------------------------
 * 浅色留白 + 逐行遮罩揭幕的引文。id="journal" 必须与 SECTION_IDS
 * 对齐（lib/data/nav.ts），改其一要同步另一。
 *
 * 数据来源：`app/page.tsx` 通过 listHomeContent() 异步拉取。本组件
 * 只负责透传 —— 不直接 import lib/data。
 */
import Interlude from "@/components/Interlude";
import type { interlude01 } from "@/lib/data/home";

export default function JournalSection({
  data,
}: {
  data: typeof interlude01;
}) {
  return (
    <Interlude
      id="journal"
      kicker={data.kicker}
      lines={data.quote}
      emphasisIndex={data.emphasisIndex}
      sig={data.sig}
    />
  );
}