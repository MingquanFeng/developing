"use client";

/**
 * CoversPanel —— "系统设置" tab 的封面管理节
 * ------------------------------------------------------------------
 * 从 AdminShell.tsx 内联拆出（30 行，搬成独立文件后 AdminShell 更瘦）。
 * 列每个 album 当前的 coverKey + 提供"设/改封面"按钮。
 */
import type { Album, Manifest } from "@/lib/contracts";
import styles from "../admin.module.css";

export type CoversPanelProps = {
  data: Manifest;
  onOpenCover: (a: Album) => void;
};

export default function CoversPanel({
  data,
  onOpenCover,
}: CoversPanelProps) {
  return (
    <section className={styles.section} aria-label="首页作品集封面">
      <header className={styles.sectionHeader}>
        <h3 className={styles.sectionTitle}>封面管理</h3>
      </header>
      <div className={styles.coversList}>
        {data.albums.map((a) => (
          <article
            key={a.id}
            className={`${styles.card} ${styles.coversRow}`}
          >
            <div className={styles.coversMeta}>
              <span className={styles.coversName}>{a.name}</span>
              <span className={styles.coversSlug}>/{a.slug}</span>
              <span className={styles.coversCoverText}>
                {a.coverKey
                  ? data.photos.find((p) => p.key === a.coverKey)?.title ??
                    a.coverKey
                  : "（未设封面）"}
              </span>
            </div>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnGhost}`}
              onClick={() => onOpenCover(a)}
            >
              {a.coverKey ? "改封面" : "设封面"}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}