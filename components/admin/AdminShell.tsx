"use client";

/**
 * AdminShell —— 后台已登录后的外壳
 * ------------------------------------------------------------------
 * 三层：
 *   1. 顶栏（标题 / counts / 退出 / 返回首页）
 *   2. notice（成功/失败条）
 *   3. DropZone + 上传队列 + tab 切换 + 当前 tab 内容（Photos/Trash/Users/Covers）
 *
 * 不持有任何业务状态——所有回调由 AdminApp 注入。
 */
import type {
  Album,
  Manifest,
  Photo,
  PublicUser,
} from "@/lib/contracts";

import DropZone from "./DropZone";
import PhotoRow from "./PhotoRow";
import UsersTab from "./tabs/UsersTab";

import { type QueueItem } from "./upload-queue";
import styles from "./admin.module.css";

export type AdminTab = "photos" | "trash" | "users" | "covers";

export type AdminShellProps = {
  me: PublicUser;
  data: Manifest;
  tab: AdminTab;
  notice: { kind: "ok" | "err"; text: string } | null;
  uploadQueue: readonly QueueItem[];
  pendingCount: number;
  selectedCount: number;
  /** 当前已选中的 photo id 集合（用于 PhotosTab 行内 checkbox） */
  selectedIds: ReadonlySet<string>;

  onTab: (t: AdminTab) => void;
  onAddFiles: (files: File[]) => void | Promise<void>;
  onRetryUpload: (item: QueueItem) => void | Promise<void>;
  onLogout: () => void | Promise<void>;
  onTrashSelected: () => void | Promise<void>;
  onEditPhoto: (id: string, patch: Partial<Photo>) => void | Promise<void>;
  onRestore: (id: string) => void | Promise<void>;
  onPurge: (id: string) => void | Promise<void>;
  onToggleSelected: (id: string) => void;
  onOpenCover: (album: Album) => void;
};

export default function AdminShell(props: AdminShellProps) {
  const {
    me,
    data,
    tab,
    notice,
    uploadQueue,
    pendingCount,
    selectedCount,
    selectedIds,
    onTab,
    onAddFiles,
    onRetryUpload,
    onLogout,
    onTrashSelected,
    onEditPhoto,
    onRestore,
    onPurge,
    onToggleSelected,
    onOpenCover,
  } = props;

  /* 严格权限隔离：
     - admin 看全部 photos + albums
     - viewer 在后台**只看自己**（ownerId === me.id）
       即使别人的照片 isPublic=true —— 公开照只该出现在
       /album 访客瀑布流，不该出现在后台。
     链路：后端 /api/album 用 visibleTo() 返「自己 + 公开」，
     访客侧 AlbumBrowser 显式「自己 + 公开」用之。
     AdminShell 这里反而**收紧**到「只自己」，因为后台的语义
     是「管理」不是「浏览」。 */
  const scoped = me.role === "admin"
    ? data
    : {
        ...data,
        albums: data.albums.filter((a) => a.ownerId === me.id),
        photos: data.photos.filter((p) => p.ownerId === me.id),
      };

  const visible = (scoped.photos).filter((p) =>
    tab === "photos" ? !p.trashedAt : !!p.trashedAt,
  );
  const trashedCount = scoped.photos.filter((p) => !!p.trashedAt).length;
  const photoCount = scoped.photos.length - trashedCount;

  return (
    <div className={`${styles.shell} ${styles.shellMain}`}>
      <header className={styles.head}>
        <div>
          <h1 className={styles.title}>相册后台</h1>
          <p className={styles.sub}>
            共 {photoCount} 张 · 版本 {String(data.revision).padStart(2, "0")}
            {me ? ` · ${me.displayName || me.username}` : ""}
          </p>
        </div>
        <div className={styles.headRight}>
          <a href="/" className={styles.ghost}>
            返回首页
          </a>
          <button className={styles.ghost} onClick={() => void onLogout()}>
            退出
          </button>
        </div>
      </header>

      {notice ? (
        <p className={notice.kind === "ok" ? styles.ok : styles.err}>
          {notice.text}
        </p>
      ) : null}

      <DropZone
        onFiles={(fs) => void onAddFiles(fs)}
        busy={false}
        pending={pendingCount}
      />

      {uploadQueue.length ? (
        <ul className={styles.queue}>
          {uploadQueue.map((it) => (
            <li key={it.uid} className={styles.qItem}>
              <span className={styles.qName} title={it.file.name}>
                {it.file.name}
              </span>
              <span className={styles.qBar}>
                <i style={{ width: `${it.progress}%` }} />
              </span>
              <span className={styles.qState}>
                {it.status === "done"
                  ? "完成"
                  : it.status === "error"
                    ? (it.error ?? "失败")
                    : `${it.progress}%`}
              </span>
              {it.status === "error" ? (
                <button
                  className={styles.mini}
                  onClick={() => void onRetryUpload(it)}
                >
                  重试
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      <div className={styles.tabs}>
        <button
          className={`${styles.tabBtn} ${tab === "photos" ? styles.tabOn : ""}`}
          onClick={() => onTab("photos")}
        >
          照片 {photoCount}
        </button>
        <button
          className={`${styles.tabBtn} ${tab === "trash" ? styles.tabOn : ""}`}
          onClick={() => onTab("trash")}
        >
          回收站 {trashedCount}
        </button>
        {me.role === "admin" ? (
          <button
            className={`${styles.tabBtn} ${tab === "users" ? styles.tabOn : ""}`}
            onClick={() => onTab("users")}
          >
            用户
          </button>
        ) : null}
        {me.role === "admin" ? (
          <button
            className={`${styles.tabBtn} ${tab === "covers" ? styles.tabOn : ""}`}
            onClick={() => onTab("covers")}
          >
            封面
          </button>
        ) : null}
        {selectedCount > 0 && tab === "photos" ? (
          <button
            className={styles.danger}
            onClick={() => void onTrashSelected()}
          >
            移入回收站 {selectedCount} 张
          </button>
        ) : null}
      </div>

      {tab === "covers" && me.role === "admin" ? (
        <CoversPanel
          data={data}
          onOpenCover={onOpenCover}
          meId={me.id}
        />
      ) : tab === "users" && me.role === "admin" ? (
        <UsersTab me={me} onSetCoverAlbum={onOpenCover} />
      ) : visible.length === 0 ? (
        <p className={styles.muted}>
          {tab === "photos" ? "还没有照片，拖文件到上面。" : "回收站是空的。"}
        </p>
      ) : (
        <ul className={styles.list}>
          {visible.map((p) => (
            <PhotoRow
              key={p.id}
              photo={p}
              albums={scoped.albums}
              checked={selectedIds.has(p.id)}
              onToggle={() => onToggleSelected(p.id)}
              onEdit={(patch) => void onEditPhoto(p.id, patch)}
              onRestore={() => void onRestore(p.id)}
              onPurge={() => void onPurge(p.id)}
              inTrash={!!p.trashedAt}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/* ============================================================
   CoversPanel —— 封面 tab 的内容（admin-only）
   内联在 AdminShell：只有 ~30 行，搬成独立文件收益不大。
   ============================================================ */
function CoversPanel({
  data,
  onOpenCover,
  meId,
}: {
  data: Manifest;
  onOpenCover: (a: Album) => void;
  meId: string;
}) {
  void meId;
  return (
    <section className={styles.albumSec}>
      <span className={styles.addTitle}>首页作品集封面</span>
      {data.albums.map((a) => (
        <div key={a.id} className={styles.albumRow}>
          <span className={styles.albumName}>{a.name}</span>
          <span className={styles.albumSlug}>/{a.slug}</span>
          <span className={styles.albumCover}>
            {a.coverKey
              ? data.photos.find((p) => p.key === a.coverKey)?.title ??
                a.coverKey
              : "（未设）"}
          </span>
          <button
            type="button"
            className={styles.mini}
            onClick={() => onOpenCover(a)}
          >
            {a.coverKey ? "改封面" : "设封面"}
          </button>
        </div>
      ))}
    </section>
  );
}
