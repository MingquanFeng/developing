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
  /** 归属者 userId。后端据此拒绝把照片写进别人的相册 */
  ownerId?: string;
};

export type Photo = {
  id: string;
  /** 原图 key —— 唯一真相来源 */
  key: string;
  albumId: string;
  /** 归属者 userId。权限判定依据，不看 role */
  ownerId: string;
  /** 是否对所有人公开。false = 只有 owner 能看，走签名 URL */
  isPublic: boolean;
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

/**
 * ⚠️ 这里**不再**生成图片 URL。
 *
 * 原来的 buildImageUrls 拼的是 COS 公开直链，绕过签名服务就能打开 ——
 * 私有照片用它等于没有隐私。已删除。
 *
 * 现在统一走 fetchPhotoUrl(photoId, variant) 取带时限的签名 URL，
 * 见 lib/album-client.ts。
 */

/** 一张图的三种用途 */
export type ImageUrls = { thumb: string; preview: string; original: string };

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
