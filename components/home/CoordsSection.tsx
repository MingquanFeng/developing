/**
 * 第 04 幕 —— 手记 02 / 对象与坐标（locations 锚点）
 * ------------------------------------------------------------------
 * 最深冷黑底 + 坐标表。id="locations" 与 SECTION_IDS 对齐。
 *
 * 原 Coords 组件内部仍用 `<Interlude id="locations" variant="dark">`
 * 包裹，所以这里直接渲染 Coords 即可。
 */
import Coords from "@/components/Coords";

export default function CoordsSection() {
  return <Coords />;
}
