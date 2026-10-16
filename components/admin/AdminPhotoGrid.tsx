"use client";

/**
 * AdminPhotoGrid —— 后台 Photos tab 的瀑布网格
 * ------------------------------------------------------------------
 * 借鉴 /album 访客侧的瀑布流（AlbumBrowser + Lightbox）：
 *  - 缩略图按真实宽高比布局（CSS Grid + ResizeObserver）
 *  - 浮层 hover 出现操作（公开/私有 toggle / 移到回收站 / 编辑）
 *  - 点击图片 → 打开 Lightbox-style 编辑弹层
 *  - 顶部有批量选择 checkbox（与原 PhotoRow 行为一致）
 *
 * 为什么不复用 AlbumBrowser：
 *  - AlbumBrowser 的 onClick 进入只读 Lightbox；后台需要 Lightbox 内可编辑
 *  - 增删改查的 onAction 全部外置（AdminApp 提供 callbacks），
 *    本组件纯展示 + 用户输入 → 调回 onAction
 *  - 因此 AdminPhotoGrid 依赖一个 LightboxForEdit 变种：见下面
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { fetchPhotoUrl } from "@/lib/album-client";
import type { Album, Photo } from "@/lib/contracts";
import styles from "./admin.module.css";

/** AdminPhotoGrid props —— 行为全外置 */
export type AdminPhotoGridProps = {
  photos: readonly Photo[];
  albums: readonly Album[];
  selectedIds: ReadonlySet<string>;
  onToggleSelected: (id: string) => void;
  onEditPhoto: (id: string, patch: Partial<Photo>) => void;
  onRestore: (id: string) => void;
  onPurge: (id: string) => void;
  /** true 时显示"恢复 / 彻底删除"动作；false 时显示"公开/私有 toggle / 回收站" */
  inTrash: boolean;
};

/** 与 AlbumBrowser 一致的瀑布流列数/间距策略 */
const COLS_AT_WIDTH = (w: number) => (w < 700 ? 2 : w < 1000 ? 3 : w < 1400 ? 4 : 5);
const GAP_AT_WIDTH = (w: number) => (w < 700 ? 10 : w < 1000 ? 14 : 20);

export default function AdminPhotoGrid({
  photos,
  albums,
  selectedIds,
  onToggleSelected,
  onEditPhoto,
  onRestore,
  onPurge,
  inTrash,
}: AdminPhotoGridProps) {
  /* ---------- 响应式列数 ---------- */
  const gridRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) =>
      setWidth(entry.contentRect.width),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, [photos.length]);

  const cols = COLS_AT_WIDTH(width);
  const gap = GAP_AT_WIDTH(width);

  /* ---------- 选中 + 当前编辑 ---------- */
  const [editingIdx, setEditingIdx] = useState<number>(-1);
  const editing = editingIdx >= 0 ? photos[editingIdx] : null;

  /* 切到空集合时关闭编辑器 */
  useEffect(() => {
    if (editingIdx >= photos.length) setEditingIdx(-1);
  }, [editingIdx, photos.length]);

  return (
    <>
      <div
        ref={gridRef}
        className={styles.adminGrid}
        style={
          {
            "--cols": cols,
            "--gap": `${gap}px`,
          } as React.CSSProperties
        }
      >
        {photos.map((p, i) => (
          <AdminPhotoCell
            key={p.id}
            photo={p}
            albums={albums}
            cellAspect={p.width && p.height ? p.height / p.width : 1}
            checked={selectedIds.has(p.id)}
            inTrash={inTrash}
            onClick={() => setEditingIdx(i)}
            onToggleCheck={() => onToggleSelected(p.id)}
            onTogglePublic={() => onEditPhoto(p.id, { isPublic: !p.isPublic })}
            onTrash={() => onEditPhoto(p.id, { trashedAt: new Date().toISOString() })}
            onRestore={() => onRestore(p.id)}
            onPurge={() => onPurge(p.id)}
          />
        ))}
      </div>

      {editing ? (
        <EditLightbox
          photo={editing}
          albums={albums}
          onClose={() => setEditingIdx(-1)}
          onPrev={() => setEditingIdx((i) => Math.max(0, i - 1))}
          onNext={() => setEditingIdx((i) => Math.min(photos.length - 1, i + 1))}
          onPatch={(patch) => onEditPhoto(editing.id, patch)}
          onMoveTrash={() =>
            onEditPhoto(editing.id, { trashedAt: new Date().toISOString() })
          }
          onRestore={() => onRestore(editing.id)}
          onPurge={() => onPurge(editing.id)}
          inTrash={inTrash}
        />
      ) : null}
    </>
  );
}

/* ============================================================
   AdminPhotoCell —— 单张照片（缩略图 + 浮层操作）
   ============================================================ */
function AdminPhotoCell({
  photo,
  albums,
  cellAspect,
  checked,
  inTrash,
  onClick,
  onToggleCheck,
  onTogglePublic,
  onTrash,
  onRestore,
  onPurge,
}: {
  photo: Photo;
  albums: readonly Album[];
  cellAspect: number;
  checked: boolean;
  inTrash: boolean;
  onClick: () => void;
  onToggleCheck: () => void;
  onTogglePublic: () => void;
  onTrash: () => void;
  onRestore: () => void;
  onPurge: () => void;
}) {
  /* 缩略图：签名 URL 缓存，Photo.id 不变则不变 */
  const [thumb, setThumb] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void fetchPhotoUrl(photo.id, "thumb").then((u) => {
      if (alive) setThumb(u);
    });
    return () => {
      alive = false;
    };
  }, [photo.id]);

  const album = albums.find((a) => a.id === photo.albumId);

  return (
    <figure
      className={styles.adminCell}
      style={{ "--cell-aspect": cellAspect } as React.CSSProperties}
    >
      <button
        type="button"
        className={styles.adminCell__media}
        onClick={onClick}
        aria-label={`编辑 ${photo.title || photo.key}`}
      >
        {thumb ? (
          <img
            src={thumb}
            alt={photo.title}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <span className={styles.adminCell__loading}>加载中…</span>
        )}
      </button>

      {/* 浮层：标题 + 相册 + 操作 */}
      <figcaption className={styles.adminCell__caption}>
        <span className={styles.adminCell__title}>
          {photo.title || photo.key}
        </span>
        <span className={styles.adminCell__album}>
          {album?.name ?? "未分组"}
          {photo.isPublic ? (
            <span className={styles.adminCell__public}>公开</span>
          ) : (
            <span className={styles.adminCell__private}>私有</span>
          )}
        </span>

        <div className={styles.adminCell__actions}>
          {!inTrash ? (
            <>
              <label className={styles.adminCell__check}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={onToggleCheck}
                  aria-label={`选择 ${photo.title}`}
                />
              </label>
              <button
                type="button"
                className={styles.adminCell__btn}
                onClick={(e) => {
                  e.stopPropagation();
                  onTogglePublic();
                }}
                title={photo.isPublic ? "设为私有" : "设为公开"}
              >
                {photo.isPublic ? "私有" : "公开"}
              </button>
              <button
                type="button"
                className={`${styles.adminCell__btn} ${styles["adminCell__btn--danger"] ?? ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onTrash();
                }}
              >
                回收站
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className={styles.adminCell__btn}
                onClick={(e) => {
                  e.stopPropagation();
                  onRestore();
                }}
              >
                恢复
              </button>
              <button
                type="button"
                className={`${styles.adminCell__btn} ${styles["adminCell__btn--danger"] ?? ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onPurge();
                }}
              >
                彻底删
              </button>
            </>
          )}
        </div>
      </figcaption>
    </figure>
  );
}

/* ============================================================
   EditLightbox —— 弹层编辑：标题 / 地点 / 简介 / 相册 / 公开
   ------------------------------------------------------------
   类似访客侧 Lightbox，但右侧有可编辑字段。
   键盘：← → 翻页、Esc 关掉、Cmd/Ctrl+S 保存。
   ============================================================ */
function EditLightbox({
  photo,
  albums,
  onClose,
  onPrev,
  onNext,
  onPatch,
  onMoveTrash,
  onRestore,
  onPurge,
  inTrash,
}: {
  photo: Photo;
  albums: readonly Album[];
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onPatch: (patch: Partial<Photo>) => void;
  onMoveTrash: () => void;
  onRestore: () => void;
  onPurge: () => void;
  inTrash: boolean;
}) {
  /* 缩略图用 preview（与 /album Lightbox 一致） */
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void fetchPhotoUrl(photo.id, "preview").then((u) => {
      if (alive) setPreview(u);
    });
    return () => {
      alive = false;
    };
  }, [photo.id]);

  /* 键盘：← → 翻页 / Esc 关 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") onPrev();
      else if (e.key === "ArrowRight") onNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onPrev, onNext]);

  /* 锁滚动 */
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  /* 编辑态（受控）；切换 photo.id 时重置 */
  const [title, setTitle] = useState(photo.title);
  const [place, setPlace] = useState(photo.place);
  const [caption, setCaption] = useState(photo.caption);
  const [albumId, setAlbumId] = useState(photo.albumId);
  const [isPublic, setIsPublic] = useState(photo.isPublic);
  useEffect(() => {
    setTitle(photo.title);
    setPlace(photo.place);
    setCaption(photo.caption);
    setAlbumId(photo.albumId);
    setIsPublic(photo.isPublic);
  }, [photo.id, photo.title, photo.place, photo.caption, photo.albumId, photo.isPublic]);

  const save = () => {
    onPatch({ title, place, caption, albumId, isPublic });
  };

  return (
    <div
      className={styles.adminEdit__backdrop}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="编辑照片"
    >
      <div
        className={styles.adminEdit}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 左：大图 */}
        <div className={styles.adminEdit__media}>
          <button
            type="button"
            className={styles.adminEdit__nav}
            onClick={onPrev}
            aria-label="上一张"
          >
            ‹
          </button>
          {preview ? (
            <img src={preview} alt={title} />
          ) : (
            <span className={styles.adminCell__loading}>加载中…</span>
          )}
          <button
            type="button"
            className={`${styles.adminEdit__nav} ${styles["adminEdit__nav--right"] ?? ""}`}
            onClick={onNext}
            aria-label="下一张"
          >
            ›
          </button>
        </div>

        {/* 右：编辑表单 */}
        <aside className={styles.adminEdit__side}>
          <header className={styles.adminEdit__head}>
            <h2>编辑照片</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="关闭"
              className={styles.modalClose}
            >
              ×
            </button>
          </header>

          <label className={styles.adminEdit__field}>
            <span>标题</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={inTrash}
            />
          </label>

          <label className={styles.adminEdit__field}>
            <span>地点</span>
            <input
              type="text"
              value={place}
              onChange={(e) => setPlace(e.target.value)}
              placeholder="拍摄地点"
              disabled={inTrash}
            />
          </label>

          <label className={styles.adminEdit__field}>
            <span>简介</span>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="作品的说明"
              rows={4}
              disabled={inTrash}
            />
          </label>

          <label className={styles.adminEdit__field}>
            <span>所在相册</span>
            <select
              value={albumId}
              onChange={(e) => setAlbumId(e.target.value)}
              disabled={inTrash}
            >
              {albums.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.adminEdit__checkRow}>
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              disabled={inTrash}
            />
            <span>公开（出现在 /album 瀑布流）</span>
          </label>

          <footer className={styles.adminEdit__foot}>
            <button
              type="button"
              className={styles.adminEdit__save}
              onClick={save}
              disabled={inTrash}
            >
              保存
            </button>
            {!inTrash ? (
              <button
                type="button"
                className={`${styles.adminEdit__btn} ${styles["adminEdit__btn--danger"] ?? ""}`}
                onClick={onMoveTrash}
              >
                移到回收站
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className={styles.adminEdit__btn}
                  onClick={onRestore}
                >
                  恢复
                </button>
                <button
                  type="button"
                  className={`${styles.adminEdit__btn} ${styles["adminEdit__btn--danger"] ?? ""}`}
                  onClick={onPurge}
                >
                  彻底删除
                </button>
              </>
            )}
          </footer>
        </aside>
      </div>
    </div>
  );
}
