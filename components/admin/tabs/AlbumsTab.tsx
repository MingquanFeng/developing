"use client";

/**
 * AlbumsTab —— 后台相册管理 tab
 * ------------------------------------------------------------------
 * 卡片网格：每张卡展示封面缩略 + 名 + 照片数 + slug + 所有者；
 * - 点卡片 → onEdit（弹层由 AdminApp 注入的 state 控制，不在本组件内）
 * - hover 浮出"封面/删除"按钮（onSetCover 不传时仅显示删除）
 * - viewer + admin 都可见；scope 已在 AdminShell 层收紧
 *
 * 瀑布流与 AdminPhotoGrid 一致：grid-auto-rows 6px + JS 算 --span，
 * 复用 .adminCell / .adminGrid 样式，与 Photos tab 视觉统一。
 *
 * 不持有任何业务状态 —— 一切来自 props。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { fetchPhotoUrl } from "@/lib/album-client";
import type { Album, Photo, PublicUser } from "@/lib/contracts";
import styles from "../admin.module.css";

/** 与 AdminPhotoGrid 一致 */
const COLS_AT_WIDTH = (w: number) => (w < 700 ? 2 : w < 1000 ? 3 : w < 1400 ? 4 : 5);
const GAP_AT_WIDTH = (w: number) => (w < 700 ? 10 : w < 1000 ? 14 : 20);
const ROW = 6;

export type Notice = { kind: "ok" | "err"; text: string };

export type AlbumsTabProps = {
  me: PublicUser;
  albums: readonly Album[];
  photos: readonly Photo[];
  onEdit: (a: Album) => void;
  onCreate: () => void;
  /** 触发现有 useCoverModal 弹层（admin 看 covers + albums 都用它） */
  onSetCover?: (a: Album) => void;
  onDelete: (id: string) => void;
  /** 删除相册前的二次确认：返回 true 才真正调 onDelete。
   *  不传则降级到 window.confirm（保留旧 fallback，避免破坏测试/开发环境）。 */
  onDeleteConfirm?: (a: Album) => Promise<boolean>;
  busy: boolean;
  msg: Notice | null;
};

export default function AlbumsTab({
  me,
  albums,
  photos,
  onEdit,
  onCreate,
  onSetCover,
  onDelete,
  onDeleteConfirm,
  msg,
}: AlbumsTabProps) {
  /* 按之前产品决策：admin 也只看自己 ownerId 的相册（admin 不再有"看全部"
     特权），所以 albums 全是同一 ownerId —— 无需按 owner 分组，
     直接走 flat 列表 */
  const flatAlbums: readonly Album[] = albums;

  /* 批 3.3: 排序 (按名称字典序 / 按更新时间近似)
     Album contract 无 createdAt / updatedAt 字段, "更新时间"fallback 用
     该相册内 photos 数组最大 id 字符码 (项目习惯 photoId 按时间序生成) */
  const [sortKey, setSortKey] = useState<"name" | "updated">("name");
  const sortedAlbums = useMemo(() => {
    const list = [...flatAlbums];
    if (sortKey === "name") {
      list.sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));
    } else {
      list.sort((a, b) => {
        const aMax = photos
          .filter((p) => p.albumId === a.id)
          .reduce((m, p) => Math.max(m, p.id.charCodeAt(0)), 0);
        const bMax = photos
          .filter((p) => p.albumId === b.id)
          .reduce((m, p) => Math.max(m, p.id.charCodeAt(0)), 0);
        return bMax - aMax;
      });
    }
    return list;
  }, [flatAlbums, photos, sortKey]);

  /* ---------- 瀑布流列数 + 每张卡的 span ---------- */
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
  }, [albums.length]);

  const cols = COLS_AT_WIDTH(width);
  const gap = GAP_AT_WIDTH(width);

  /* 每张相册的封面照片 w/h → span。无封面或缺 w/h 时回退 30（默认高） */
  const spanByAlbum = useMemo(() => {
    const m = new Map<string, number>();
    if (!width) {
      for (const a of albums) m.set(a.id, 30);
      return m;
    }
    const cellW = (width - gap * (cols - 1)) / cols;
    for (const a of albums) {
      const cover = a.coverKey
        ? photos.find((p) => p.key === a.coverKey)
        : photos.find((p) => p.albumId === a.id && !p.trashedAt);
      if (cover && cover.width && cover.height) {
        m.set(
          a.id,
          Math.max(
            2,
            Math.ceil((cellW * (cover.height / cover.width) + gap) / ROW),
          ),
        );
      } else {
        m.set(a.id, 30);
      }
    }
    return m;
  }, [width, cols, gap, albums, photos]);

  return (
    <div ref={gridRef}>
      {msg ? (
        <p className={msg.kind === "ok" ? styles.ok : styles.err}>
          {msg.text}
        </p>
      ) : null}

      <section className={styles.albumsSection}>
        <header className={styles.albumsToolbar}>
          <div className={styles.pageHeader}>
            <h2 className={styles.pageTitle}>相册</h2>
            <span className={styles.pageSub}>共 {albums.length} 个</span>
          </div>
          <div className={styles.toolbarSpacer} />
          <select
            className={`${styles.input} ${styles.albumsSort}`}
            value={sortKey}
            onChange={(e) =>
              setSortKey(e.target.value as "name" | "updated")
            }
            aria-label="排序"
          >
            <option value="name">按名称</option>
            <option value="updated">按更新时间</option>
          </select>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={onCreate}
          >
            + 新建相册
          </button>
        </header>

        {flatAlbums.length === 0 ? (
          <div className={styles.emptyState}>
            <h3 className={styles.emptyStateTitle}>还没有相册</h3>
            <p className={styles.emptyStateBody}>
              点上方「新建相册」开始分组管理照片。
            </p>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnPrimary}`}
              onClick={onCreate}
            >
              + 新建相册
            </button>
          </div>
        ) : (
          <div
            className={styles.adminGrid}
            style={
              {
                "--cols": cols,
                "--gap": `${gap}px`,
                marginTop: 0,
              } as React.CSSProperties
            }
          >
            {sortedAlbums.map((a) => (
              <AlbumCard
                key={a.id}
                album={a}
                photos={photos}
                rowSpan={spanByAlbum.get(a.id) ?? 30}
                onEdit={onEdit}
                onSetCover={onSetCover}
                onDelete={onDelete}
                onDeleteConfirm={onDeleteConfirm}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/* ============================================================
   AlbumCard —— 单张相册卡（缩略 + 元数据 + 浮层操作）
   与 AdminPhotoCell 视觉统一（也复用 .adminCell__*），
   这样 viewer 切换 Photos/Albums tab 时不会有违和感。
   ============================================================ */
function AlbumCard({
  album,
  photos,
  rowSpan,
  onEdit,
  onSetCover,
  onDelete,
  onDeleteConfirm,
}: {
  album: Album;
  photos: readonly Photo[];
  rowSpan: number;
  onEdit: (a: Album) => void;
  onSetCover?: (a: Album) => void;
  onDelete: (id: string) => void;
  onDeleteConfirm?: (a: Album) => Promise<boolean>;
}) {
  /* 封面 key：优先 album.coverKey，否则拿第一张非回收站照片 */
  const coverPhoto = useMemo(() => {
    if (album.coverKey) {
      const m = photos.find((p) => p.key === album.coverKey);
      if (m) return m;
    }
    return photos.find(
      (p) => p.albumId === album.id && !p.trashedAt,
    );
  }, [album.coverKey, album.id, photos]);

  /* 批 3.3: 照片数显式 (spec 要) */
  const photoCount = useMemo(
    () => photos.filter((p) => p.albumId === album.id && !p.trashedAt).length,
    [photos, album.id],
  );

  return (
    <figure
      className={`${styles.adminCell} ${styles["adminCell--alwaysCaption"] ?? ""}`}
      style={{ "--span": rowSpan } as React.CSSProperties}
    >
      <button
        type="button"
        className={styles.adminCell__media}
        onClick={() => onEdit(album)}
        aria-label={`编辑相册 ${album.name}`}
      >
        {coverPhoto ? (
          <CoverThumb photoId={coverPhoto.id} />
        ) : (
          <span className={styles.adminCell__loading}>暂无照片</span>
        )}
      </button>

      {/* 批 3.3: caption 始终可见, 不再 hover 触发 (CSS 同步改 .adminCell__caption opacity 1) */}
      <figcaption className={styles.adminCell__caption}>
        <div className={styles.adminCell__captionRow}>
          <span className={styles.adminCell__title}>{album.name}</span>
          <span className={styles.albumCount}>{photoCount} 张</span>
        </div>

        <div className={styles.adminCell__actions}>
          {onSetCover ? (
            <button
              type="button"
              className={styles.adminCell__btn}
              onClick={(e) => {
                e.stopPropagation();
                onSetCover(album);
              }}
            >
              {album.coverKey ? "改封面" : "封面"}
            </button>
          ) : null}
          <button
            type="button"
            className={`${styles.adminCell__btn} ${styles["adminCell__btn--danger"] ?? ""}`}
            onClick={async (e) => {
              e.stopPropagation();
              /* 优先用 AdminApp 的自定义 confirm 弹层；不传时降级到
                 window.confirm（保留旧 fallback，便于 vitest/Storybook）。 */
              let ok = true;
              if (onDeleteConfirm) {
                ok = await onDeleteConfirm(album);
              } else if (
                !confirm(
                  `确定删除相册「${album.name}」？\n\n该相册的非回收站照片会转入「回收相册」。`,
                )
              ) {
                ok = false;
              }
              if (ok) onDelete(album.id);
            }}
            style={{ marginLeft: onSetCover ? "auto" : "0" }}
          >
            删除
          </button>
        </div>
      </figcaption>
    </figure>
  );
}

/* 抽出来：单独组件让 useEffect 依赖 photoId 干净 */
function CoverThumb({ photoId }: { photoId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void fetchPhotoUrl(photoId, "thumb").then((u) => {
      if (alive) setUrl(u);
    });
    return () => {
      alive = false;
    };
  }, [photoId]);
  if (!url) return <span className={styles.adminCell__loading}>加载中…</span>;
  return <img src={url} alt="" loading="lazy" decoding="async" />;
}
