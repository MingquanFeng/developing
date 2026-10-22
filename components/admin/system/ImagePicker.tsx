"use client";

/**
 * ImagePicker —— 从公开相册里挑一张照片
 * ------------------------------------------------------------------
 * 只列**公开相册里的照片**（isPublic && 没有 trashedAt）——
 * 与 lib/site-images 的 pickPublicPhoto 同口径：私有的 / 已进回收站的
 * 照片不该被选成首页大图。
 *
 * 数据来源自己拉 lib/admin-api/manifest.ts 的 fetchManifest()：
 * 后台 App 手里那份 manifest 是登录用户的可见集（含私有图），跟这里
 * 要的「公开图全集」不是一回事，不复用。
 *
 * 缩略图走 /api/photo/[id]/url?v=thumb（PhotoThumb 懒加载，
 * 进视口前 300px 才取签名 URL）。
 *
 * Esc 关掉；点遮罩关掉。选中即回调 photo 对象 —— 组件不持有业务状态。
 */
import { useEffect, useMemo, useState } from "react";
import { fetchManifest } from "@/lib/admin-api/manifest";
import type { Album, Photo } from "@/lib/contracts";
import PhotoThumb from "./PhotoThumb";
import styles from "../admin.module.css";

export type ImagePickerProps = {
  /** 是否打开。关闭时不渲染（也不发请求） */
  open: boolean;
  onClose: () => void;
  /** 选中一张照片 */
  onSelect: (photo: Photo) => void;
  /** 当前已选中的 photoId —— 高亮显示 */
  selectedId?: string | null;
};

type Status = "loading" | "ready" | "error";

export default function ImagePicker({
  open,
  onClose,
  onSelect,
  selectedId,
}: ImagePickerProps) {
  const [status, setStatus] = useState<Status>("loading");
  const [albums, setAlbums] = useState<Album[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);

  /* 打开时拉一次清单；关掉就丢弃结果（别让请求在后台空跑） */
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setStatus("loading");
    fetchManifest()
      .then((m) => {
        if (cancelled) return;
        setAlbums(m.albums);
        setPhotos(m.photos);
        setStatus("ready");
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        console.warn("[ImagePicker] 读公开相册失败", e);
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  /* Esc 关闭 */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  /* 锁滚动 —— 弹层打开时背景不该跟着滚 */
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  /* 只留公开、且不在回收站的照片，按相册分组 */
  const groups = useMemo(() => {
    const publicPhotos = photos.filter((p) => p.isPublic && !p.trashedAt);
    const byAlbum = new Map<string, Photo[]>();
    for (const p of publicPhotos) {
      const list = byAlbum.get(p.albumId);
      if (list) list.push(p);
      else byAlbum.set(p.albumId, [p]);
    }
    const albumById = new Map(albums.map((a) => [a.id, a]));
    return [...byAlbum.entries()]
      .map(([albumId, list]) => ({
        albumId,
        name: albumById.get(albumId)?.name ?? "其他公开相册",
        order: albumById.get(albumId)?.order ?? 999,
        photos: list,
      }))
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  }, [albums, photos]);

  if (!open) return null;

  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="从公开相册选择照片"
      >
        <header className={styles.modalHead}>
          <h2 className={styles.modalTitle}>从公开相册选择</h2>
          <button
            type="button"
            className={styles.modalClose}
            onClick={onClose}
          >
            关闭
          </button>
        </header>

        {status === "loading" ? (
          <p className={styles.modalHint}>正在读取公开相册…</p>
        ) : null}

        {status === "error" ? (
          <p className={styles.modalHint}>
            读不到相册数据 —— 请确认已登录且 COS 可达，稍后重试。
          </p>
        ) : null}

        {status === "ready" && groups.length === 0 ? (
          <p className={styles.modalHint}>
            还没有公开相册的照片。先在「相册」里把照片设为公开。
          </p>
        ) : null}

        {groups.map((g) => (
          <div key={g.albumId}>
            <p className={styles.modalMeta}>
              {g.name} · {g.photos.length} 张
            </p>
            <div className={styles.coverGrid}>
              {g.photos.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`${styles.coverItem} ${
                    p.id === selectedId ? styles.coverItemCurrent : ""
                  }`}
                  onClick={() => onSelect(p)}
                  title={p.title || p.id}
                >
                  <PhotoThumb photoId={p.id} alt={p.title} />
                  <span className={styles.coverTitle}>{p.title || p.id}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
