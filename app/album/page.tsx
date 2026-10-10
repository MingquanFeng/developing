import type { Metadata } from "next";
import { fetchManifest, signerEndpoint, type Manifest } from "@/lib/album-client";
import AlbumBrowser from "@/components/album/AlbumBrowser";
import Footer from "@/components/Footer";
import styles from "@/components/album/album.module.css";

export const metadata: Metadata = {
  title: "相册",
  description: "塞上空许的私人影像档案——按时间与地点编排的全部照片。",
};

/**
 * 必须显式声明静态。
 * 构建期取数用了 cache:"no-store"，Next 会据此把路由判定为动态，
 * 与 output:"export" 冲突，构建直接失败：
 *   Route /album with `dynamic = "error"` couldn't be rendered statically
 * 声明 force-static 后，这次 fetch 只在构建时跑一次并烘进 HTML。
 */
export const dynamic = "force-static";

/**
 * 构建期取一次清单，烘进静态 HTML。
 * 取不到就返回 null，客户端挂载时自己再取；都取不到才显示错误。
 */
async function buildTimeManifest(): Promise<Manifest | null> {
  const ep = signerEndpoint("/api/album");
  if (!ep) return null;
  try {
    return await fetchManifest();
  } catch {
    // 构建期取不到不是致命错误，运行时还有一次机会
    return null;
  }
}

export default async function AlbumPage() {
  const initial = await buildTimeManifest();

  return (
    <>
      <main className={styles.page}>
        <div className={styles.top}>
          <a href="/">← 返回作品</a>
          <span>塞上空许 · 私人影像档案</span>
        </div>

        <header className={styles.head}>
          <h1 className={styles.title}>
            <em>全部</em>
            <em>影像</em>
            <span className={styles.titleSuffix}>ARCHIVE</span>
          </h1>
          <div className={styles.side}>
            <span className="kicker">— 相册 / 2023 — 2026</span>
            <p>
              私人影像档案。按时间与地点编排，不分辑、不排序。
              {"\n"}点开任意一张进入全屏，键盘 ← → 翻页。
            </p>
          </div>
        </header>

        <AlbumBrowser initial={initial} />
      </main>

      <Footer />
    </>
  );
}