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
 *
 * ⚠️ 类型的唯一权威源在 lib/contracts.ts。这里只 re-export，让
 *    `import type { Album, Photo } from "@/lib/album-types"`
 *    这条历史路径继续工作（PR-1 起 6 个月内）。新代码请直接
 *    `import type { ... } from "@/lib/contracts"`。
 */

import type {
  Album as AlbumContract,
  Photo as PhotoContract,
  Manifest as ManifestContract,
} from "@/lib/contracts";

export type Album = AlbumContract;
export type Photo = PhotoContract;

/**
 * 历史别名：清单。早年代码用 AlbumManifest 指清单，现统称 Manifest。
 * 等前端一处不用一处删，最后留给 ESLint 离线扫尾。
 */
export type AlbumManifest = ManifestContract;

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
