import type { Metadata } from "next";
import AlbumBrowser from "@/components/album/AlbumBrowser";
import Footer from "@/components/Footer";
import styles from "@/components/album/album.module.css";

export const metadata: Metadata = {
  title: "相册",
  description: "塞上空许的私人影像档案——按时间与地点编排的全部照片。",
};

export default function AlbumPage() {
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

        <AlbumBrowser />
      </main>

      <Footer />
    </>
  );
}
