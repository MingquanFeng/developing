import Nav from "@/components/Nav";
import MetaBar from "@/components/MetaBar";
import Hero from "@/components/Hero";
import Interlude from "@/components/Interlude";
import Works, { ImageFallbackProvider } from "@/components/Works";
import Coords from "@/components/Coords";
import Story from "@/components/Story";
import About from "@/components/About";
import Subscribe from "@/components/Subscribe";
import Footer from "@/components/Footer";
import { interlude01, interlude03, series as seriesData } from "@/lib/data";
import { readManifest } from "@/lib/signer/album";
import { presignGet } from "@/lib/signer/cos";
import { CI_PREVIEW } from "@/lib/signer/config";
import { getFirstAdminId } from "@/lib/signer/users";

/**
 * 视觉节奏（严格遵循「影像—留白—文字—影像」）：
 *  01 HERO      满屏影像
 *  02 手记 01   浅色留白 · 文字
 *  03 WORKS     深底 · 单图目录（每屏仅一张主图）—— 封面图从 COS 真实拉
 *  04 手记 02   最深冷黑 · 坐标表
 *  05 STORY     满屏影像（视觉高潮）
 *  06 手记 03   浅色留白 · 大留白
 *  07 ABOUT     浅色双栏
 *  08 SUBSCRIBE 浅纸色
 *  09 FOOTER    最深冷黑
 */
export default async function Home() {
  /**
   * 作品集 5 组的封面：只从主管理员上传的照片里挑。
   *
   *   1. album.coverKey —— admin 在后台「设封面」明确指定的 photo
   *   2. 兜底 —— 该 album 下属于主管理员 + isPublic + 非回收站的第一张
   *
   * 用 getFirstAdminId() 卡"主页封面只属于 admin"：viewer 上传
   * 的 isPublic 图不影响首页。coverKey 只能 admin 改（PUT /api/album
   * 要 admin），所以即使 viewer 上传图到 5 个 series 对应的 album，也
   * 不会被首页默认当封面。
   *
   * 任一步失败（manifest 读不出 / 找不到 admin / 找不到 album / 找不
   * 到 photo / COS 签失败）都静默用原 image 兜底，首屏永远不白。
   */
  const series = await enrichSeriesWithCovers(seriesData);

  return (
    <>
      <ImageFallbackProvider />
      <Nav />
      <MetaBar />

      <main>
        <Hero />
        <Interlude
          id="journal"
          kicker={interlude01.kicker}
          lines={interlude01.quote}
          emphasisIndex={interlude01.emphasisIndex}
          sig={interlude01.sig}
        />
        <Works series={series} />
        <Coords />
        <Story />
        <Interlude
          kicker={interlude03.kicker}
          lines={interlude03.quote}
          small
          variant="minimal"
        />
        <About />
        <Subscribe />
      </main>

      <Footer />
    </>
  );
}

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
async function enrichSeriesWithCovers<
  T extends { key: string; image: string; imageAlt: string; albumSlug?: string },
>(items: readonly T[]): Promise<T[]> {
  let manifest;
  try {
    manifest = await readManifest();
  } catch {
    return [...items];
  }
  // 主管理员 id 找不到（极端：没 admin 或全 disabled）时仍走兜底，但
  // 不过滤 owner —— 否则连一张图都找不到、首屏反而白。
  const adminId = getFirstAdminId();
  return Promise.all(
    items.map(async (s) => {
      if (!s.albumSlug) return s;
      const album = manifest.albums.find((a) => a.slug === s.albumSlug);
      if (!album) return s;
      // 1. coverKey 指定 —— 只接受 admin 选的（PUT /api/album 要 admin，
      //    非 admin 改不了，coverKey 必然是 admin 下的 photo）
      const coverPhoto = album.coverKey
        ? manifest.photos.find((p) => p.key === album.coverKey)
        : undefined;
      // 2. 兜底：第一张公开 + 非回收站 + 属于主管理员
      const fallbackPhoto = coverPhoto
        ? undefined
        : manifest.photos
            .filter(
              (p) =>
                p.albumId === album.id &&
                p.isPublic &&
                !p.trashedAt &&
                (adminId === null || p.ownerId === adminId),
            )
            .sort((a, b) => a.id.localeCompare(b.id))[0];
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
