"use client";

/**
 * CoverModal —— 选 album 封面
 * ------------------------------------------------------------------
 * 数据：photos 是该 album 下非回收站的照片元数据；组件内部按需用
 * fetchPhotoUrl 异步取缩略图 URL（缓存命中直接命中）。
 *
 * Props 全部 onSelect / onClear / onClose —— 状态机在父 hook（useCoverModal）
 * 手里，组件本身只管渲染；保持无业务副作用。
 */
import { useEffect, useState } from "react";
import { fetchPhotoUrl } from "@/lib/album-client";
import type { Album, Photo } from "@/lib/contracts";
import styles from "../admin.module.css";

export type CoverModalProps = {
  album: Album;
  photos: Photo[];
  onPick: (photoKey: string) => void;
  onClear: () => void;
  onClose: () => void;
  busy: boolean;
};

export default function CoverModal({
  album,
  photos,
  onPick,
  onClear,
  onClose,
  busy,
}: CoverModalProps) {
  const [urls, setUrls] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      photos.map(async (p) => {
        try {
          const u = await fetchPhotoUrl(p.id, "thumb");
          return [p.id, u ?? null] as const;
        } catch {
          return [p.id, null] as const;
        }
      }),
    ).then((entries) => {
      if (cancelled) return;
      const m = new Map<string, string>();
      for (const [id, u] of entries) if (u) m.set(id, u);
      setUrls(m);
    });
    return () => {
      cancelled = true;
    };
  }, [photos]);

  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="选择封面"
      >
        <header className={styles.modalHead}>
          <h2 className={styles.modalTitle}>选择封面 — {album.name}</h2>
          <button
            type="button"
            className={styles.modalClose}
            onClick={onClose}
            disabled={busy}
          >
            关闭
          </button>
        </header>

        {album.coverKey ? (
          <div className={styles.modalMeta}>
            当前封面：
            <b>
              {photos.find((p) => p.key === album.coverKey)?.title ??
                album.coverKey}
            </b>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnGhost}`}
              onClick={onClear}
              disabled={busy}
            >
              清除
            </button>
          </div>
        ) : null}

        {photos.length === 0 ? (
          <p className={styles.modalHint}>该相册还没有非回收站照片，先去上传。</p>
        ) : (
          <div className={styles.coverGrid}>
            {photos.map((p) => {
              const url = urls.get(p.id);
              const isCurrent = p.key === album.coverKey;
              return (
                <button
                  key={p.id}
                  type="button"
                  className={`${styles.coverItem} ${
                    isCurrent ? styles.coverItemCurrent : ""
                  }`}
                  onClick={() => onPick(p.key)}
                  disabled={busy || !url}
                  title={p.title || p.key}
                >
                  {url ? (
                    <img src={url} alt={p.title} />
                  ) : (
                    <span className={styles.modalMeta}>加载中…</span>
                  )}
                  <span className={styles.coverTitle}>
                    {p.title || p.id}
                  </span>
                  {isCurrent ? (
                    <span className={`${styles.badge} ${styles.badgeAccent}`}>当前</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
