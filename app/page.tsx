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
   * 作品集 5 组的封面：从 manifest 按 albumSlug 找对应 album，
   * 取其第一张 isPublic 且非回收站的照片，签名 preview URL。
   * 没匹配上就保留 lib/data.ts 里的 Unsplash 兜底图。
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
 * 把 series 元数据里 `albumSlug` 指向的 album 第一张公开照片签成 URL 替换封面。
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
  return Promise.all(
    items.map(async (s) => {
      if (!s.albumSlug) return s;
      const album = manifest.albums.find((a) => a.slug === s.albumSlug);
      if (!album) return s;
      const photo = manifest.photos
        .filter(
          (p) =>
            p.albumId === album.id && p.isPublic && !p.trashedAt,
        )
        .sort((a, b) => a.id.localeCompare(b.id))[0];
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
