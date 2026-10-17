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
  msg,
}: AlbumsTabProps) {
  /* 按 ownerId 分组：admin 看全部，按 owner 分片；viewer 看不到分组头 */
  const groups = useMemo(() => {
    if (me.role === "admin") {
      const m = new Map<string, Album[]>();
      for (const a of albums) {
        const k = a.ownerId ?? "_unknown";
        const arr = m.get(k);
        if (arr) arr.push(a);
        else m.set(k, [a]);
      }
      return [...m.entries()];
    }
    return [["self", albums]] as Array<[string, readonly Album[]]>;
  }, [albums, me.role]);

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

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginTop: 4,
          marginBottom: 18,
        }}
      >
        <span className={styles.addTitle}>
          相册 {albums.length}
        </span>
        <button
          type="button"
          className={styles.primary}
          onClick={onCreate}
          style={{
            width: "auto",
            marginTop: 0,
            padding: "8px 18px",
            marginLeft: "auto",
          }}
        >
          新建相册
        </button>
      </div>

      {albums.length === 0 ? (
        <p className={styles.muted}>
          {me.role === "admin"
            ? "尚无相册。"
            : "还没有相册，点上面「新建相册」开始。"}
        </p>
      ) : me.role === "admin" ? (
        groups.map(([owner, list]) => (
          <section key={owner} className={styles.albumSec}>
            <div className={styles.albumGroup}>
              <span className={styles.albumOwner}>
                {owner === "_unknown" ? "未指派" : owner}
              </span>
              <div
                className={styles.adminGrid}
                style={
                  {
                    "--cols": cols,
                    "--gap": `${gap}px`,
                  } as React.CSSProperties
                }
              >
                {list.map((a) => (
                  <AlbumCard
                    key={a.id}
                    album={a}
                    photos={photos}
                    rowSpan={spanByAlbum.get(a.id) ?? 30}
                    onEdit={onEdit}
                    onSetCover={onSetCover}
                    onDelete={onDelete}
                    showOwner={false}
                  />
                ))}
              </div>
            </div>
          </section>
        ))
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
          {albums.map((a) => (
            <AlbumCard
              key={a.id}
              album={a}
              photos={photos}
              rowSpan={spanByAlbum.get(a.id) ?? 30}
              onEdit={onEdit}
              onSetCover={onSetCover}
              onDelete={onDelete}
              showOwner={me.role === "admin"}
            />
          ))}
        </div>
      )}
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
  showOwner,
}: {
  album: Album;
  photos: readonly Photo[];
  rowSpan: number;
  onEdit: (a: Album) => void;
  onSetCover?: (a: Album) => void;
  onDelete: (id: string) => void;
  showOwner: boolean;
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

  const photoCount = photos.filter(
    (p) => p.albumId === album.id && !p.trashedAt,
  ).length;

  return (
    <figure className={styles.adminCell}>
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

      <figcaption className={styles.adminCell__caption}>
        <span className={styles.adminCell__title}>{album.name}</span>
        <span className={styles.adminCell__album}>
          {album.desc ? (
            <span
              style={{
                fontFamily: "var(--sans)",
                textTransform: "none",
                letterSpacing: 0,
                opacity: 0.7,
                maxWidth: "100%",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                display: "block",
              }}
              title={album.desc}
            >
              {album.desc}
            </span>
          ) : null}
          <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span>/{album.slug}</span>
            <span>· {photoCount} 张</span>
            {showOwner && album.ownerId ? (
              <span>· {album.ownerId}</span>
            ) : null}
          </span>
        </span>

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
            onClick={(e) => {
              e.stopPropagation();
              if (
                confirm(
                  `确定删除相册「${album.name}」？\n\n该相册的非回收站照片会转入「回收相册」。`,
                )
              ) {
                onDelete(album.id);
              }
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
