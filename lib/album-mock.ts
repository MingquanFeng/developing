/**
 * 相册演示数据
 * ------------------------------------------------------------------
 * 上传功能未接入前，用现有作品集的图源撑起完整的浏览效果，
 * 方便先定视觉。接入 COS 后整个文件可删除，改由签名服务返回。
 *
 * 刻意混入横竖不同的比例，用来验证瀑布网格是否真的按原始宽高比排布。
 */

import { series, FALLBACK_IMAGES } from "./data";
import type { Album, AlbumManifest, Photo } from "./album-types";

/* 相册 = 现有作品集的五个系列，外加一个「未成册」 */
const ALBUMS: Album[] = [
  ...series.map((s, i) => ({
    id: `alb_${s.key}`,
    slug: s.key,
    name: s.name,
    desc: s.note,
    coverKey: null,
    order: i + 1,
  })),
  {
    id: "alb_misc",
    slug: "misc",
    name: "未成册",
    desc: "不属于任何一次的随手记录。",
    coverKey: null,
    order: series.length + 1,
  },
];

/**
 * 每张图的**真实**宽高比。
 *
 * 这一条必须准：网格单元按这里的比例定高，再用 object-fit 填充。
 * 比例一旦对不上，照片就会被裁掉上下或左右（实测踩过）。
 * 数字由 sips 实测原图得出，不是估的。
 * 接 COS 后这些值来自服务端读到的图片元数据，同样要求准确。
 */
const REAL_RATIO: Record<string, [number, number]> = {
  "photo-1488426862026-3ee34a7d66df": [2, 3],
  "photo-1469334031218-e382a71b716b": [3, 2],
  "photo-1488161628813-04466f872be2": [4, 5],
  "photo-1531746020798-e6953c6e8e04": [4, 5],
  "photo-1492288991661-058aa541ff43": [2, 3],
  "photo-1496747611176-843222e1e57c": [3, 2],
  "photo-1503342217505-b0a15ec3261c": [3, 2],
  "photo-1539571696357-5a69c17a67c6": [2, 3],
  "photo-1517841905240-472988babdf9": [2, 3],
};

/** 每个相册的张数 */
const COUNTS = [6, 5, 5, 6, 4, 5];

/** 去掉 Unsplash 的查询串，取原始图片地址当 key */
const baseOf = (url: string) => url.split("?")[0];

const PLACES = [
  "上海 · 静安",
  "北京 · 东四",
  "莫干山 · 筏溪",
  "拉萨 · 八廓街",
  "大理 · 周城",
  "上海 · 弄堂",
];

/** 从完整 URL 或裸 id 里取出 photo-xxx，避免两者对不上。
 *  字符集必须含连字符 —— Unsplash 的 id 本身就是 "数字-十六进制" 两段 */
function photoId(key: string) {
  return key.match(/(photo-[a-z0-9-]+)/)?.[1] ?? "";
}

/** 按真实比例反推一个像样的像素尺寸，仅用于展示 */
function pixelSize(key: string): { width: number; height: number } {
  const ratio = REAL_RATIO[photoId(key)] ?? [3, 2];
  const width = 4000;
  return {
    width,
    height: Math.round((width * ratio[1]) / ratio[0] / 10) * 10,
  };
}

function buildPhotos(): Photo[] {
  const out: Photo[] = [];
  let seed = 0;

  ALBUMS.forEach((album, ai) => {
    const count = COUNTS[ai] ?? 5;
    for (let i = 0; i < count; i++) {
      /* 确定性轮转：同一 seed 每次刷新结果一致 */
      const key = baseOf(FALLBACK_IMAGES[seed % FALLBACK_IMAGES.length]);
      const s = series[ai % series.length];
      const { width, height } = pixelSize(key);

      out.push({
        id: `ph_${String(seed + 1).padStart(3, "0")}`,
        key,
        albumId: album.id,
        title: `对象 ${String(seed + 1).padStart(2, "0")}`,
        caption: `${s.meta.split(" · ")[0]} · ${
          PLACES[seed % PLACES.length]
        }`,
        place: PLACES[seed % PLACES.length],
        shotAt: `202${3 + ((seed + ai) % 2)}-0${1 + ((seed * 3) % 9)}-1${
          seed % 9
        }`,
        width,
        height,
        bytes: 8_000_000 + ((seed * 1_730_000) % 12_000_000),
      });
      seed++;
    }
  });

  return out;
}

export const mockManifest: AlbumManifest = {
  revision: 1,
  updatedAt: "2026-10-08T02:00:00Z",
  albums: ALBUMS.map((a) => ({ ...a })),
  photos: buildPhotos(),
};
