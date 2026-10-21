/**
 * 第 04 幕 —— 手记 02 / 对象与坐标（locations 锚点）
 * ------------------------------------------------------------------
 * 最深冷黑底 + 坐标表。id="locations" 与 SECTION_IDS 对齐。
 *
 * 原 Coords 组件内部仍用 `<Interlude id="locations" variant="dark">`
 * 包裹，所以这里直接渲染 Coords 即可。
 *
 * 数据来源：`app/page.tsx` 通过 listHomeContent() 异步拉取。本组件
 * 只负责透传 —— 不直接 import lib/data。
 */
import Coords from "@/components/Coords";
import type { coords } from "@/lib/data/home";

export default function CoordsSection({ data }: { data: typeof coords }) {
  return <Coords data={data} />;
}