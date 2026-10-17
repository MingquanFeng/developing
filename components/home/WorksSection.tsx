/**
 * 第 03 幕 —— 人像志（WORKS）
 * ------------------------------------------------------------------
 * *本节是首页唯一接 props 的 section*：series 是被
 * lib/series-covers 在 server 层增强过的 COS 签名 URL，不能再走
 * 自取数据。series 的类型与 lib/data/home 的 series 完全一致（保证
 * 构建期被替换 image/imageAlt 字段后形状不变）。
 *
 * 注意：客户端 `<Works>` 已有 default 参数；若此处不传 series 它会
 * 用 defaultSeries 也走得通 —— 但首页场景下我们必须传被增强的那一
 * 份，所以它是必填。
 */
import Works from "@/components/Works";
import type { series as defaultSeries } from "@/lib/data/home";

/** 一项 series 的精确形态（与 lib/data/home 的 series 同构） */
type SeriesItem = (typeof defaultSeries)[number];
type Series = readonly SeriesItem[];

export default function WorksSection({ series }: { series: Series }) {
  return <Works series={series} />;
}
