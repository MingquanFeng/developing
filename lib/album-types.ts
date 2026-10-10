/**
 * 相册数据模型 + 图片 URL 构造
 * ------------------------------------------------------------------
 * 与 docs/PRD.md 第 4 节的 `_data/album.json` 结构保持一致。
 *
 * 「双模式」说明：
 *   key 以 http 开头  → 当作外链，用于临时预览或外部图床
 *   key 为普通路径    → 当作腾讯云 COS 对象键，走数据万象 imageMogr2 处理
 *
 * 真实清单由 lib/album-client.ts 从签名服务拉取。
 */

/* ========== 类型 ========== */

export type Album = {
  id: string;
  slug: string;
  name: string;
  desc: string;
  /** 封面 key，为空则取该相册第一张 */
  coverKey: string | null;
  order: number;
};

export type Photo = {
  id: string;
  /** 原图 key —— 唯一真相来源 */
  key: string;
  albumId: string;
  title: string;
  caption: string;
  place: string;
  /** 拍摄时间 YYYY-MM-DD */
  shotAt: string;
  width: number;
  height: number;
  bytes: number;
  /** 软删除时间。非空表示已进回收站，后台可见、访客侧不可见 */
  trashedAt?: string | null;
};

export type AlbumManifest = {
  revision: number;
  updatedAt: string;
  albums: Album[];
  photos: Photo[];
};

/* ========== 图片 URL ========== */

/** COS 桶的访问根地址，接入后由环境变量注入 */
const COS_BASE = process.env.NEXT_PUBLIC_COS_BASE_URL ?? "";

/** 一张图的三种用途 */
export type ImageUrls = { thumb: string; preview: string; original: string };

/**
 * 数据万象处理串（接 COS 后生效）
 *   auto-orient  按 EXIF 自动旋正（手机竖拍照片必需）
 *   thumbnail    只限宽、高度等比 —— 不裁切。网格单元本身就是按原始
 *                宽高比排布的，若这里强裁成方形，object-fit 会二次裁切
 *   format/webp  传输格式
 */
const CI_THUMB = "imageMogr2/auto-orient/thumbnail/560x/format/webp/quality/80";
const CI_PREVIEW =
  "imageMogr2/auto-orient/thumbnail/1600x/format/webp/quality/85";

function isRemote(key: string) {
  return /^https?:\/\//.test(key);
}

/**
 * 按 key 生成缩略图 / 预览图 / 原图地址。
 * 远端图走对方的缩放参数，COS 图走 imageMogr2。
 */
export function buildImageUrls(key: string): ImageUrls {
  if (isRemote(key)) {
    return {
      thumb: `${key}?w=560&q=80&auto=format&fit=max`,
      preview: `${key}?w=1600&q=85&auto=format&fit=max`,
      original: key,
    };
  }

  const base = `${COS_BASE}/${key}`;
  return {
    thumb: `${base}?${CI_THUMB}`,
    preview: `${base}?${CI_PREVIEW}`,
    original: base,
  };
}

/* ========== 展示辅助 ========== */

/** 字节数 → 人类可读 */
export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function formatDate(iso: string) {
  return iso.replace(/-/g, " · ");
}
