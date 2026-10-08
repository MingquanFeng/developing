"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { mockManifest } from "@/lib/album-mock";
import { buildImageUrls, type Photo } from "@/lib/album-types";
import Lightbox from "./Lightbox";
import styles from "./album.module.css";

/** 网格行高（px），与 CSS 的 grid-auto-rows 保持一致 */
const ROW = 6;

const pad = (n: number) => String(n).padStart(2, "0");

/* ============================================================
   LazyImg —— 进入视口前 300px 才设 src
   ============================================================ */
function LazyImg({ photo }: { photo: Photo }) {
  const ref = useRef<HTMLDivElement>(null);
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSrc(buildImageUrls(photo.key).thumb);
          io.disconnect();
        }
      },
      { rootMargin: "300px" },
    );

    io.observe(el);
    return () => io.disconnect();
  }, [photo.key]);

  return (
    /* 绝对定位铺满 cell，不依赖百分比高度解析 —— .cell 是 relative */
    <div ref={ref} style={{ position: "absolute", inset: 0 }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className={styles.cellImg} src={src} alt={photo.title} loading="lazy" />
      ) : null}
    </div>
  );
}

/* ============================================================
   AlbumBrowser —— 相册列表 + 瀑布网格 + 灯箱
   相册切换走 ?album=slug 查询参数。
   刻意不用 useSearchParams：它会把整棵子树降级为纯客户端渲染，
   静态导出时 HTML 里就只剩 fallback。改用 useState + pushState，
   既保留 URL 语义，又能让「全部」视图被完整预渲染进 index.html。
   ============================================================ */
export default function AlbumBrowser() {
  const { albums, photos } = mockManifest;

  /* null = 全部 */
  const [slug, setSlug] = useState<string | null>(null);
  const active = slug ?? "all";

  /* 挂载后同步真实 URL，并接管浏览器前进/后退 */
  useEffect(() => {
    const read = () =>
      setSlug(new URLSearchParams(window.location.search).get("album"));
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);

  /* slug（如 lhasa）→ albumId（如 alb_lhasa），两者不能混用 */
  const activeAlbum = albums.find((a) => a.slug === active);

  const list = useMemo(() => {
    if (active === "all") return photos;
    const id = albums.find((a) => a.slug === active)?.id;
    return id ? photos.filter((p) => p.albumId === id) : [];
  }, [photos, albums, active]);

  const countOf = (id: string) => photos.filter((p) => p.albumId === id).length;

  const go = (next: string) => {
    window.history.pushState(
      null,
      "",
      next === "all" ? "/album/" : `/album/?album=${next}`,
    );
    setSlug(next === "all" ? null : next);
    setOpen(-1);
  };

  /* ---------- 灯箱 ---------- */
  const [open, setOpen] = useState(-1);
  const close = () => setOpen(-1);
  const prev = () => setOpen((i) => Math.max(0, i - 1));
  const next = () => setOpen((i) => Math.min(list.length - 1, i + 1));

  /* ---------- 瀑布网格：按容器宽度算列数、间距与跨行数 ---------- */
  const gridRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [list.length]);

  /* 手机也保持两列：单列时一张竖幅就占满整屏，31 张翻到天荒地老 */
  const cols = width < 1000 ? 2 : width < 1320 ? 3 : 4;
  const gap = width < 640 ? 12 : width < 1000 ? 16 : 20;

  const spans = useMemo(() => {
    if (!width) return list.map(() => 20);
    const cellW = (width - gap * (cols - 1)) / cols;
    return list.map((p) =>
      Math.max(2, Math.ceil((cellW * (p.height / p.width) + gap) / ROW)),
    );
  }, [width, cols, gap, list]);

  const current = open >= 0 ? list[open] : null;

  return (
    <>
      <div className={styles.bar}>
        <button
          type="button"
          className={`${styles.tab} ${active === "all" ? styles.tabActive : ""}`}
          onClick={() => go("all")}
        >
          全部 <span className={styles.tabCount}>{photos.length}</span>
        </button>
        {albums.map((a) => (
          <button
            key={a.id}
            type="button"
            className={`${styles.tab} ${active === a.slug ? styles.tabActive : ""}`}
            onClick={() => go(a.slug)}
          >
            {a.name} <span className={styles.tabCount}>{countOf(a.id)}</span>
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <div className={styles.empty}>此相册暂无照片</div>
      ) : (
        <div
          ref={gridRef}
          className={styles.grid}
          style={
            {
              "--cols": cols,
              "--gap": `${gap}px`,
            } as React.CSSProperties
          }
        >
          {list.map((p, i) => (
            <div
              key={p.id}
              className={styles.cell}
              style={{ "--span": spans[i] } as React.CSSProperties}
              role="button"
              tabIndex={0}
              onClick={() => setOpen(i)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setOpen(i);
                }
              }}
              aria-label={`查看 ${p.title}`}
            >
              <LazyImg photo={p} />
              <div className={styles.cellMeta}>
                <span>{p.title}</span>
                <span>{p.place}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className={styles.rail}>
        <span>
          {active === "all" ? "全部影像" : activeAlbum?.name}
          {" · "}
          {pad(list.length)} 张
        </span>
        <span className={styles.railSep} />
        <span>{activeAlbum?.desc ?? "按时间与地点编排的私人影像档案。"}</span>
      </div>

      {current ? (
        <Lightbox
          photos={list}
          index={open}
          onClose={close}
          onPrev={prev}
          onNext={next}
        />
      ) : null}
    </>
  );
}
