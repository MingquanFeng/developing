/**
 * 首页作品集封面取数（仅服务端可用）
 * ------------------------------------------------------------------
 * 唯一允许 import lib/signer/* 的位置。顶部 `import "server-only"`
 * 一旦被某个 Client Component 误 import，下一次 next build 时会立刻
 * 报红（webpack 拦截 "server-only" 字符串别名）。
 *
 * 视觉节奏（详见 app/page.tsx 注释）：
 *   首页 9 幕中，「WORKS」一组的封面图要从 COS 真实拉。
 *   优先级：
 *     1. album.coverKey —— admin 在后台「设封面」明确指定的 photo
 *     2. 兜底 —— 该 album 下属于主管理员 + isPublic + 非回收站的第一张
 *
 * 失败兜底：任一步读不到都静默用原 image，**首屏永远不白**。
 *
 * 设计：依赖注入
 *   readManifest / presignGet / getFirstAdminId 三者都通过参数传入，
 *   默认从 lib/signer/* 取。单测时换成 stub，不依赖 node:sqlite 与 COS。
 *   任何 import 顺序与副作用都不会逃出函数本体（这是 server-only 之外
 *   的另一道保险 —— signer 都依赖 Node 模块，无法在浏览器跑）。
 */
import "server-only";

import { readManifest as readManifestImpl } from "@/lib/signer/album";
import { presignGet as presignGetImpl } from "@/lib/signer/cos";
import { CI_PREVIEW } from "@/lib/signer/config";
import { getFirstAdminId as getFirstAdminIdImpl } from "@/lib/signer/users";

import type { Manifest, Photo, Album } from "@/lib/contracts";

/**
 * 一组首页所需的字段（裁剪版的 SeriesMeta）。
 * 兼容老 data.ts 里 `key/image/imageAlt/albumSlug` 的形状。
 */
export type SeriesCoverInput = {
  key: string;
  image: string;
  imageAlt: string;
  albumSlug?: string;
};

/** enrichSeriesWithCovers 的可选依赖注入槽 */
export type SeriesCoversDeps = {
  readManifest?: () => Promise<Manifest>;
  presignGet?: (key: string, opts: { ci: string }) => Promise<string>;
  getFirstAdminId?: () => string | null;
};

/**
 * 把 series 元数据里 `albumSlug` 指向的 album 的一张公开照片签成 URL 替换封面。
 *
 * 优先级：
 *   1. album.coverKey —— admin 在后台「设封面」明确指定的 photo
 *   2. 兜底 —— 该 album 第一张 isPublic + 非回收站照片（按 id 排序）
 *
 * 任一步失败（manifest 读不出 / 找不到 album / 找不到 photo / COS 签失败）
 * 都不抛错 —— 静默用原 image 兜底，首屏永远不白。
 */
export async function enrichSeriesWithCovers<
  T extends SeriesCoverInput,
>(items: readonly T[], deps: SeriesCoversDeps = {}): Promise<T[]> {
  const readManifest = deps.readManifest ?? readManifestImpl;
  const presignGet = deps.presignGet ?? presignGetImpl;
  const getFirstAdminId = deps.getFirstAdminId ?? getFirstAdminIdImpl;

  let manifest: Manifest;
  try {
    manifest = await readManifest();
  } catch {
    return [...items];
  }

  // 主管理员 id 找不到（极端：没 admin 或全 disabled）时仍走兜底，但
  // 不过滤 owner —— 否则连一张图都找不到、首屏反而白。
  const adminId = safeGetFirstAdminId(getFirstAdminId);

  return Promise.all(
    items.map(async (s) => {
      if (!s.albumSlug) return s;
      const album = manifest.albums.find(
        (a) => a.slug === s.albumSlug,
      );
      if (!album) return s;

      // 1. coverKey 指定 —— 只接受 admin 选的（PUT /api/album 要 admin，
      //    非 admin 改不了，coverKey 必然是 admin 下的 photo）
      const coverPhoto = album.coverKey
        ? manifest.photos.find((p) => p.key === album.coverKey)
        : undefined;
      // 2. 兜底：第一张公开 + 非回收站 + 属于主管理员
      const fallbackPhoto = coverPhoto
        ? undefined
        : pickFallback(manifest.photos, album.id, adminId);

      const photo = coverPhoto ?? fallbackPhoto;
      if (!photo) return s;

      try {
        const url = await presignGet(photo.key, { ci: CI_PREVIEW });
        return {
          ...s,
          image: url,
          imageAlt: photo.title || album.name || s.imageAlt,
        };
      } catch {
        return s;
      }
    }),
  );
}

/** 选该 album 第一张公开 + 非回收站照片，按 id 排序。导出供单测。 */
export function pickFallback(
  photos: Photo[],
  albumId: Album["id"],
  adminId: string | null,
): Photo | undefined {
  return photos
    .filter(
      (p) =>
        p.albumId === albumId &&
        p.isPublic &&
        !p.trashedAt &&
        (adminId === null || p.ownerId === adminId),
    )
    .sort((a, b) => a.id.localeCompare(b.id))[0];
}

/** getFirstAdminId 在 SQLite 损坏时可能抛；吞掉回 null，触发不过滤 owner 的兜底分支。 */
function safeGetFirstAdminId(fn: () => string | null): string | null {
  try {
    return fn();
  } catch {
    return null;
  }
}
