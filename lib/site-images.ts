/**
 * 首页图片解析（仅服务端可用）
 * ------------------------------------------------------------------
 * 后台「站点内容」里 hero / story / about / series 的图片可以**直接挑
 * 公开相册里的照片**。挑中后**只存 photoId**（见 lib/data/*.ts）——
 * 绝不存签名 URL：COS 的签名读 URL 900 秒就过期（lib/signer/config.ts
 * 的 readExpires），存进 DB 等于存了个定时炸弹，到期后首页全是碎图。
 *
 * 本模块在**渲染时**按 photoId 现签：
 *   photoId → manifest 里查 photo → 校验「公开且不在回收站」
 *            → presignGet(CI_PREVIEW，1600px webp)
 *
 * 失败兜底：任一步读不到（清单读不出 / 照片不存在 / 照片是私有的 /
 * 照片在回收站 / 签名失败）都**静默保留原值**，绝不抛错 ——
 * 首屏永远不白（与 lib/series-covers 的容错原则一致）。
 *
 * 设计：依赖注入
 *   readManifest / presignGet 通过参数传入，默认从 lib/signer/* 取。
 *   单测时换成 stub，不依赖 node:sqlite 与真 COS。
 *   任何 import 顺序与副作用都不会逃出函数本体（这是 server-only 之外
 *   的另一道保险 —— signer 都依赖 Node 模块，无法在浏览器跑）。
 */
import "server-only";

import { readManifest as readManifestImpl } from "@/lib/signer/album";
import { presignGet as presignGetImpl } from "@/lib/signer/cos";
import { CI_PREVIEW } from "@/lib/signer/config";

import type { Manifest, Photo } from "@/lib/contracts";

/** 依赖注入槽 */
export type SiteImagesDeps = {
  readManifest?: () => Promise<Manifest>;
  presignGet?: (key: string, opts: { ci: string }) => Promise<string>;
};

/**
 * 单图 section（hero / story）的最小形状。
 * `image` 是兜底图 —— photoId 解析失败时原样返回。
 */
export type ImageSlot = {
  photoId?: string | null;
  image: string;
  imageAlt: string;
};

/**
 * about 的最小形状 —— 字段名跟别处不一样（portrait / portraitAlt），
 * 但语义完全一致：portrait 是兜底图，photoId 命中时覆盖。
 */
export type PortraitSlot = {
  photoId?: string | null;
  portrait: string;
  portraitAlt: string;
};

/** series 一项的最小形状 */
export type SeriesSlot = {
  photoId?: string | null;
  image: string;
  imageAlt: string;
};

/** resolveHomeImages 需要的 4 块内容 */
export type HomeImageSections = {
  hero: ImageSlot;
  story: ImageSlot;
  about: PortraitSlot;
  series: readonly SeriesSlot[];
};

/** 解析成功的照片：签名 URL + 照片元信息（alt 用得上 title） */
export type ResolvedPhoto = {
  url: string;
  photo: Photo;
};

/* ============================================================
   细粒度函数 —— 可单测
   ============================================================ */

/**
 * 从清单里挑一张「允许展示」的照片。
 *
 * 只接受 **isPublic 且没有 trashedAt** 的照片 —— 后台的图片选择器也只
 * 列出这两类，两端口径必须一致：私有的或已进回收站的照片不该出现在
 * 首页上，哪怕有人手改了 DB 里的 photoId。
 */
export function pickPublicPhoto(
  manifest: Manifest,
  photoId: string,
): Photo | undefined {
  const photo = manifest.photos.find((p) => p.id === photoId);
  if (!photo) return undefined;
  if (!photo.isPublic) return undefined;
  if (photo.trashedAt) return undefined;
  return photo;
}

/**
 * photoId → 签名 URL + 照片。取不到（找不到 / 不公开 / 在回收站 /
 * 签名失败 / 清单读不出）一律返回 null，**不抛错**。
 */
export async function resolvePhoto(
  photoId: string | null | undefined,
  deps: SiteImagesDeps = {},
): Promise<ResolvedPhoto | null> {
  const resolve = await createResolver(deps);
  return resolve(photoId);
}

/**
 * hero / story 的单图位：photoId 命中则覆盖 image。
 *
 * alt 的规则：**已填的不动，空的才用照片标题补**。用户在后台手写的
 * alt 是有意为之，不能被服务端的自动填充盖掉。
 */
export async function resolveImageSlot<T extends ImageSlot>(
  slot: T,
  deps: SiteImagesDeps = {},
): Promise<T> {
  const resolve = await createResolver(deps);
  return applyImageSlot(slot, resolve);
}

/** about 的肖像位 —— 同 resolveImageSlot，只是字段名是 portrait */
export async function resolvePortraitSlot<T extends PortraitSlot>(
  slot: T,
  deps: SiteImagesDeps = {},
): Promise<T> {
  const resolve = await createResolver(deps);
  return applyPortraitSlot(slot, resolve);
}

/**
 * series 5 组的图片位。
 *
 * alt 的规则跟单图位**相反**：照片标题优先。
 *
 * 原因：series 的 image/imageAlt 由 lib/series-covers 的相册封面 enrichment
 * 接管（它会把 imageAlt 换成相册封面的照片标题）。若这里再按「已填不动」
 * 的规则走，alt 描述的会是相册封面那张图，而页面上显示的是 admin 显式
 * 选中的另一张 —— alt 与图对不上（无障碍问题）。所以显式选择的照片，
 * 它的标题才是这张图该有的 alt。
 */
export async function resolveSeriesSlots<T extends SeriesSlot>(
  items: readonly T[],
  deps: SiteImagesDeps = {},
): Promise<T[]> {
  const resolve = await createResolver(deps);
  return Promise.all(
    items.map(async (it) => {
      const r = await resolve(it.photoId);
      if (!r) return it;
      return {
        ...it,
        image: r.url,
        imageAlt: r.photo.title || it.imageAlt,
      } as unknown as T;
    }),
  );
}

/**
 * 一次性处理首页 4 块内容里的 photoId。
 *
 * 只解析 photoId —— 相册封面那条线（albumSlug → coverKey）归
 * lib/series-covers 管，两者的优先级在 app/page.tsx 里排：
 *   先 enrichSeriesWithCovers（相册封面），再套 photoId 覆盖
 *   —— 显式选的照片优先于相册封面。
 *
 * 4 块共用一次清单读取（manifest 可能不小，别读 4 遍）。
 */
export async function resolveHomeImages<T extends HomeImageSections>(
  home: T,
  deps: SiteImagesDeps = {},
): Promise<T> {
  const resolve = await createResolver(deps);
  const [hero, story, about, series] = await Promise.all([
    applyImageSlot(home.hero, resolve),
    applyImageSlot(home.story, resolve),
    applyPortraitSlot(home.about, resolve),
    Promise.all(
      home.series.map(async (it) => {
        const r = await resolve(it.photoId);
        if (!r) return it;
        return {
          ...it,
          image: r.url,
          imageAlt: r.photo.title || it.imageAlt,
        } as unknown as typeof it;
      }),
    ),
  ]);
  return {
    ...home,
    hero,
    story,
    about,
    series,
  } as unknown as T;
}

/* ============================================================
   内部实现
   ============================================================ */

/** 解析器：photoId → ResolvedPhoto | null（自带缓存与容错） */
type Resolver = (
  photoId: string | null | undefined,
) => Promise<ResolvedPhoto | null>;

/**
 * 造一个解析器。
 *
 * 清单**懒加载一次**（第一次真的要用时才读），之后所有 photoId 复用；
 * 同一个 photoId 只签一次（hero 和 series 选中同一张图时省一次签名）。
 */
async function createResolver(deps: SiteImagesDeps): Promise<Resolver> {
  const readManifest = deps.readManifest ?? readManifestImpl;
  const presignGet = deps.presignGet ?? presignGetImpl;

  let manifest: Manifest | null = null;
  let loaded = false;
  const cache = new Map<string, Promise<ResolvedPhoto | null>>();

  const load = async (): Promise<Manifest | null> => {
    if (!loaded) {
      loaded = true;
      try {
        manifest = await readManifest();
      } catch {
        /* 清单读不出 → 当成没有可选照片，全部回落兜底图 */
        manifest = null;
      }
    }
    return manifest;
  };

  return async (photoId) => {
    if (!photoId) return null;
    const hit = cache.get(photoId);
    if (hit) return hit;

    const p = (async (): Promise<ResolvedPhoto | null> => {
      const m = await load();
      if (!m) return null;
      const photo = pickPublicPhoto(m, photoId);
      if (!photo) return null;
      try {
        const url = await presignGet(photo.key, { ci: CI_PREVIEW });
        if (!url) return null;
        return { url, photo };
      } catch {
        /* 签名失败 —— 静默回落兜底图 */
        return null;
      }
    })();

    cache.set(photoId, p);
    return p;
  };
}

/** hero / story 的图片位 */
async function applyImageSlot<T extends ImageSlot>(
  slot: T,
  resolve: Resolver,
): Promise<T> {
  const r = await resolve(slot.photoId);
  if (!r) return slot;
  return {
    ...slot,
    image: r.url,
    imageAlt: slot.imageAlt || r.photo.title,
  } as unknown as T;
}

/** about 的肖像位 */
async function applyPortraitSlot<T extends PortraitSlot>(
  slot: T,
  resolve: Resolver,
): Promise<T> {
  const r = await resolve(slot.photoId);
  if (!r) return slot;
  return {
    ...slot,
    portrait: r.url,
    portraitAlt: slot.portraitAlt || r.photo.title,
  } as unknown as T;
}
