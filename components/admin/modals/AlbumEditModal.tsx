"use client";

/**
 * AlbumEditModal —— 相册编辑/新建弹层
 * ------------------------------------------------------------------
 * 仿 EditLightbox 双栏：
 *   左：大封面预览；create 模式显示占位
 *   右：表单（name / slug / desc / coverKey 选封面 + 所属照片缩略列表）
 *
 * Esc 关掉；Cmd/Ctrl+S 提交；删除走内联"再次确认"按钮 + 文案切换，
 * 避免一次性 window.confirm 把用户挡在弹层外。
 *
 * 不持有业务状态 —— 表单用本地 state 暂存，最终一次性 onPatch/onCreate
 * 写回。busy 由 hook 控制（提交期间禁用按钮）。
 */
import { useEffect, useMemo, useState } from "react";
import { fetchPhotoUrl } from "@/lib/album-client";
import { newAlbumId, slugify } from "@/lib/album-id";
import type { Album, Photo } from "@/lib/contracts";
import styles from "../admin.module.css";

export type AlbumEditModalProps = {
  mode: "create" | "edit";
  /** edit 时必填 */
  album?: Album;
  /** 该相册下非回收站照片（create 模式可为空） */
  photos: readonly Photo[];
  /** 同 owner 已有 album 列表（用于 slug 撞名时给 caller 预览/去重） */
  fallbackAlbums: readonly Album[];
  ownerId: string;
  onClose: () => void;
  onCreate?: (input: {
    name: string;
    slug?: string;
    desc?: string;
    coverKey?: string | null;
  }) => Promise<void>;
  onPatch?: (id: string, partial: Partial<Album>) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  /** 触发现有 useCoverModal 弹层（共享 cover 选择 UI） */
  onSetCover?: (album: Album) => void;
  busy: boolean;
};

export default function AlbumEditModal({
  mode,
  album,
  photos,
  fallbackAlbums,
  ownerId,
  onClose,
  onCreate,
  onPatch,
  onDelete,
  onSetCover,
  busy,
}: AlbumEditModalProps) {
  /* 受控表单（edit 用现值，create 空起步） */
  const [name, setName] = useState(album?.name ?? "");
  const [slug, setSlug] = useState(album?.slug ?? "");
  const [desc, setDesc] = useState(album?.desc ?? "");
  const [coverKey, setCoverKey] = useState<string | null>(
    album?.coverKey ?? null,
  );
  /* slug 输入：create 模式允许手填覆盖，edit 模式只读 */
  const [slugTouched, setSlugTouched] = useState(mode === "edit");
  /* 删除二次确认 */
  const [confirmDelete, setConfirmDelete] = useState(false);

  /* Esc 关掉 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (
        (e.metaKey || e.ctrlKey) &&
        e.key.toLowerCase() === "s"
      ) {
        e.preventDefault();
        void submit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, slug, desc, coverKey, busy]);

  /* 锁滚动 */
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  /* create 模式下，name 变时自动推 slug（首次推之后用户可继续覆盖） */
  useEffect(() => {
    if (mode !== "create" || slugTouched) return;
    setSlug(slugify(name));
  }, [name, mode, slugTouched]);

  /** create 模式下预览真实 id：alb_<owner>_<slug>_<n>（n 取最小可用） */
  const previewId = useMemo(() => {
    if (mode !== "create") return album?.id ?? "";
    const effectiveSlug = slug || slugify(name);
    if (!effectiveSlug) return "";
    const taken = new Set(fallbackAlbums.map((a) => a.id));
    return newAlbumId(ownerId, effectiveSlug, taken);
  }, [mode, album?.id, slug, name, ownerId, fallbackAlbums]);

  const previewCoverPhoto = useMemo(() => {
    if (!coverKey) return null;
    return photos.find((p) => p.key === coverKey) ?? null;
  }, [coverKey, photos]);

  const coverPhotoForPreview = useMemo(() => {
    if (previewCoverPhoto) return previewCoverPhoto;
    return photos[0] ?? null;
  }, [previewCoverPhoto, photos]);

  async function submit() {
    if (busy) return;
    if (!name.trim()) return;
    if (mode === "create") {
      if (!onCreate) return;
      await onCreate({
        name: name.trim(),
        slug: slug || undefined,
        desc: desc || undefined,
        coverKey,
      });
      // 父组件会在成功后 close
    } else {
      if (!onPatch || !album) return;
      await onPatch(album.id, {
        name: name.trim(),
        desc,
        coverKey,
        // slug 在 edit 模式不变更 —— 不开放，避免破坏 URL/引用
      });
    }
  }

  async function handleDelete() {
    if (!onDelete || !album) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    await onDelete(album.id);
  }

  const canDelete = mode === "edit" && !!onDelete && !!album;

  return (
    <div
      className={styles.adminEdit__backdrop}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={mode === "create" ? "新建相册" : "编辑相册"}
    >
      <div
        className={styles.adminEdit}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 左：大图预览 */}
        <div className={styles.adminEdit__media}>
          {mode === "create" ? (
            <span
              className={styles.adminCell__loading}
              style={{
                background: "var(--bg-2)",
                width: "100%",
                height: "100%",
              }}
            >
              新建相册预览
            </span>
          ) : coverPhotoForPreview ? (
            <CoverPreview photoId={coverPhotoForPreview.id} />
          ) : (
            <span
              className={styles.adminCell__loading}
              style={{
                background: "var(--bg-2)",
                width: "100%",
                height: "100%",
              }}
            >
              暂无照片
            </span>
          )}
        </div>

        {/* 右：表单 */}
        <aside className={styles.adminEdit__side}>
          <header className={styles.adminEdit__head}>
            <h2>{mode === "create" ? "新建相册" : "编辑相册"}</h2>
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
            <span>名称</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="相册名"
              disabled={busy}
              autoFocus
            />
          </label>

          <label className={styles.adminEdit__field}>
            <span>slug</span>
            <input
              type="text"
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value);
              }}
              placeholder={mode === "create" ? "自动从名称推导" : ""}
              disabled={busy || mode === "edit"}
              style={
                mode === "create"
                  ? { fontFamily: "var(--mono)", fontSize: 13 }
                  : undefined
              }
            />
            {mode === "create" ? (
              <small
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 10.5,
                  letterSpacing: ".1em",
                  opacity: 0.5,
                  marginTop: 2,
                }}
              >
                id: {previewId || "—"}
              </small>
            ) : null}
          </label>

          <label className={styles.adminEdit__field}>
            <span>简介</span>
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="一句话描述（可空）"
              rows={3}
              disabled={busy}
            />
          </label>

          <div className={styles.adminEdit__field}>
            <span>封面</span>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 0",
              }}
            >
              {coverKey ? (
                <span
                  className={styles.albumCover}
                  title={coverKey}
                  style={{ flex: "0 1 auto", maxWidth: 240 }}
                >
                  {previewCoverPhoto?.title ?? coverKey}
                </span>
              ) : (
                <span className={styles.modalHint}>（未设封面）</span>
              )}
              <button
                type="button"
                className={styles.mini}
                onClick={() => {
                  // create 时保存完才能选——否则 album 还没 id。
                  // 但 useCoverModal 需要 album 参数；
                  // create 模式预览时，可以构造一个占位 album 喂给它，
                  // 存 coverKey 时换用 onCreate 的回调。
                  if (mode === "create") {
                    const tmp: Album = {
                      id: previewId || "alb__pending_",
                      slug: slug || slugify(name),
                      name: name || "未命名",
                      desc: desc || "",
                      coverKey,
                      order: 9999,
                      ownerId,
                    };
                    onSetCover?.(tmp);
                  } else if (album) {
                    onSetCover?.(album);
                  }
                }}
                disabled={busy || !onSetCover}
                style={{ marginLeft: "auto" }}
              >
                {coverKey ? "改封面" : "选封面"}
              </button>
              {coverKey ? (
                <button
                  type="button"
                  className={styles.mini}
                  onClick={() => setCoverKey(null)}
                  disabled={busy}
                >
                  清除
                </button>
              ) : null}
            </div>
          </div>

          {mode === "edit" && photos.length > 0 ? (
            <div className={styles.adminEdit__field}>
              <span>该相册照片（前 {Math.min(8, photos.length)} 张）</span>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
                  gap: 6,
                  padding: "6px 0 0",
                }}
              >
                {photos.slice(0, 8).map((p) => (
                  <PhotoThumb key={p.id} photoId={p.id} />
                ))}
              </div>
            </div>
          ) : null}

          <footer className={styles.adminEdit__foot}>
            <button
              type="button"
              className={styles.adminEdit__save}
              onClick={submit}
              disabled={busy || !name.trim()}
            >
              {mode === "create" ? "创建" : "保存"}
            </button>

            {canDelete ? (
              <button
                type="button"
                className={`${styles.adminEdit__btn} ${
                  styles["adminEdit__btn--danger"] ?? ""
                }`}
                onClick={handleDelete}
                disabled={busy}
              >
                {confirmDelete ? "再次确认删除" : "删除相册"}
              </button>
            ) : null}
          </footer>
        </aside>
      </div>
    </div>
  );
}

/* ============================================================
   缩略图小组件 —— 复用 AdminPhotoGrid 的缩略图获取策略
   ============================================================ */
function PhotoThumb({ photoId }: { photoId: string }) {
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
  return (
    <div
      style={{
        aspectRatio: "1 / 1",
        background: "var(--bg)",
        border: "1px solid var(--line-2)",
        borderRadius: 3,
        overflow: "hidden",
        position: "relative",
      }}
    >
      {url ? (
        <img
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : null}
    </div>
  );
}

function CoverPreview({ photoId }: { photoId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void fetchPhotoUrl(photoId, "preview").then((u) => {
      if (alive) setUrl(u);
    });
    return () => {
      alive = false;
    };
  }, [photoId]);
  if (!url) return <span className={styles.adminCell__loading}>加载中…</span>;
  return <img src={url} alt="" />;
}
