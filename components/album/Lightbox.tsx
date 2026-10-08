"use client";

import { useCallback, useEffect } from "react";
import {
  buildImageUrls,
  formatBytes,
  formatDate,
  type Photo,
} from "@/lib/album-types";
import styles from "./Lightbox.module.css";

const pad = (n: number) => String(n).padStart(2, "0");

export default function Lightbox({
  photos,
  index,
  onClose,
  onPrev,
  onNext,
}: {
  photos: Photo[];
  index: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const photo = photos[index];

  /* ---- 键盘：← → Esc ---- */
  const onKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") onPrev();
      else if (e.key === "ArrowRight") onNext();
    },
    [onClose, onPrev, onNext],
  );

  useEffect(() => {
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onKey]);

  /* ---- 锁滚动 + 记住原滚动位置 ---- */
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  /* ---- 预加载相邻两张，翻页不等待 ---- */
  useEffect(() => {
    [index - 1, index + 1].forEach((i) => {
      const n = photos[i];
      if (!n) return;
      const img = new Image();
      img.src = buildImageUrls(n.key).preview;
    });
  }, [index, photos]);

  if (!photo) return null;

  const { preview, original } = buildImageUrls(photo.key);

  /* ---- 触摸左右滑动翻页 ---- */
  let touchX = 0;
  const onTouchStart = (e: React.TouchEvent) => {
    touchX = e.changedTouches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) < 50) return;
    if (dx > 0) onPrev();
    else onNext();
  };

  return (
    <div className={styles.box} role="dialog" aria-modal="true" aria-label={photo.title}>
      {/* ---------- 顶部 ---------- */}
      <div className={styles.bar}>
        <span>
          {pad(index + 1)} / {pad(photos.length)}
        </span>
        <span className={styles.barSep} />
        <span>{formatDate(photo.shotAt)}</span>
        <button
          type="button"
          className={styles.icon}
          onClick={onClose}
          aria-label="关闭"
        >
          ✕
        </button>
      </div>

      {/* ---------- 画面 ---------- */}
      <div
        className={styles.stage}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={photo.id}
          className={styles.img}
          src={preview}
          alt={photo.title}
        />
      </div>

      {/* ---------- 底部 ---------- */}
      <div className={styles.foot}>
        <div>
          <h3 className={styles.title}>{photo.title}</h3>
          <p className={styles.caption}>{photo.caption}</p>
          <div className={styles.specs}>
            <span>{photo.place}</span>
            <span>
              {photo.width} × {photo.height}
            </span>
            <span>{formatBytes(photo.bytes)}</span>
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button
            type="button"
            className={styles.icon}
            onClick={onPrev}
            disabled={index === 0}
            aria-label="上一张"
          >
            ←
          </button>
          <button
            type="button"
            className={styles.icon}
            onClick={onNext}
            disabled={index === photos.length - 1}
            aria-label="下一张"
          >
            →
          </button>
          <a
            className={styles.download}
            href={original}
            download
            target="_blank"
            rel="noreferrer"
          >
            下载原图 <span aria-hidden>↓</span>
          </a>
        </div>
      </div>
    </div>
  );
}
