"use client";

/**
 * AdminShell v2 —— 后台已登录后的外壳（sidebar 布局）
 * ------------------------------------------------------------------
 * 三区：
 *   1. 左侧 sidebar（240px 固定）: logo+title + nav + 底部状态
 *   2. 右侧 main 内: TopBar（搜索/铃铛/头像）+ hero + 当前 nav 的内容
 *
 * nav 项 → AdminTab 映射（admin 比 viewer 多 2 项）：
 *   home    — 仪表盘：Hero + 大上传区 + 装饰卡
 *   photos  — 照片管理（顶部子筛选全部/回收站切换）
 *   albums  — 相册分类（AlbumsTab，viewer + admin 可见）
 *   users   — 用户管理（admin-only：UsersTab）
 *   system  — 系统设置（admin-only：CoversPanel 封面选择）
 *
 * DropZone 大块视觉只挂在 home tab；整页 window-level drag-drop 由
 * AdminApp 顶层 useGlobalFileDrop 接管，所有 nav 都能响应文件拖入。
 *
 * 不持有任何业务状态——所有回调由 AdminApp 注入。
 */
import type {
  Album,
  Manifest,
  Photo,
  PublicUser,
} from "@/lib/contracts";

import { useEffect, useMemo, useState } from "react";

import DropZone from "./DropZone";
import AdminPhotoGrid from "./AdminPhotoGrid";
import UsersTab from "./tabs/UsersTab";
import AlbumsTab from "./tabs/AlbumsTab";

import { type QueueItem } from "./upload-queue";
import { fetchPhotoUrl } from "@/lib/album-client";
import styles from "./admin.module.css";

export type AdminTab = "home" | "photos" | "albums" | "users" | "system";

export type AdminShellProps = {
  me: PublicUser;
  data: Manifest;
  tab: AdminTab;
  /** 当前 nav 内的子筛选：仅 photos tab 用到（"all" | "trash"）。 */
  photoFilter: "all" | "trash";
  setPhotoFilter: (v: "all" | "trash") => void;
  notice: { kind: "ok" | "err"; text: string } | null;
  uploadQueue: readonly QueueItem[];
  pendingCount: number;
  selectedIds: ReadonlySet<string>;

  onTab: (t: AdminTab) => void;
  onAddFiles: (files: File[]) => void | Promise<void>;
  onRetryUpload: (item: QueueItem) => void | Promise<void>;
  onLogout: () => void | Promise<void>;
  onTrashSelected: () => void | Promise<void>;
  onRestoreSelected: () => void | Promise<void>;
  onEditPhoto: (id: string, patch: Partial<Photo>) => void | Promise<void>;
  onRestore: (id: string) => void | Promise<void>;
  onPurge: (id: string) => void | Promise<void>;
  onToggleSelected: (id: string) => void;
  onOpenCover: (album: Album) => void;

  /* Albums tab 联动：viewer + admin 都可见 */
  onEditAlbum: (a: Album) => void;
  onCreateAlbum: () => void;
  onDeleteAlbum: (id: string) => void;
  onSetAlbumCover?: (a: Album) => void;
  /** EditLightbox"管理相册"按钮回调（可选：不传则不渲染按钮） */
  onJumpAlbums?: () => void;

  /** 通用 confirm 弹层请求：返回 Promise<boolean>，true = 用户确认。
   *  不传则子组件退化到 window.confirm（向后兼容旧调用）。 */
  onRequestConfirm?: (opts: {
    title: string;
    body: string;
    danger?: boolean;
    confirmLabel?: string;
    cancelLabel?: string;
  }) => Promise<boolean>;

  /** 全选/取消全选（仅 photos tab 用） */
  onSelectAll?: () => void;
  /** 当前可见 photos 是否全部已选（全选 checkbox 的 checked） */
  allChecked?: boolean;
  /** 当前可见 photos 是否部分已选（全选 checkbox 的 indeterminate） */
  someChecked?: boolean;

  /* AlbumsTab 局部反馈（来自 useAlbumsPanel，header 已有全局 notice） */
  albumsBusy?: boolean;
  albumsMsg?: { kind: "ok" | "err"; text: string } | null;

  /* 上传目标相册：AdminApp 算好后传进来，Home tab 显示选择器 */
  targetAlbumId: string | null;
  myAlbums: readonly Album[];
  fallbackAlbum: Album | null;
  onChangeTargetAlbum: (id: string | null) => void;
};

export default function AdminShell(props: AdminShellProps) {
  const {
    me,
    data,
    tab,
    photoFilter,
    setPhotoFilter,
    notice,
    uploadQueue,
    pendingCount,
    selectedIds,
    onTab,
    onAddFiles,
    onRetryUpload,
    onLogout,
    onTrashSelected,
    onRestoreSelected,
    onEditPhoto,
    onRestore,
    onPurge,
    onToggleSelected,
    onOpenCover,
    onEditAlbum,
    onCreateAlbum,
    onDeleteAlbum,
    onSetAlbumCover,
    onJumpAlbums,
    onRequestConfirm,
    onSelectAll,
    allChecked = false,
    someChecked = false,
    targetAlbumId,
    myAlbums,
    fallbackAlbum,
    onChangeTargetAlbum,
  } = props;

  /* 严格权限隔离：admin 与 viewer 同权 —— 都只看到自己 ownerId 的相册 + 照片。
     后端 visibleTo 已按登录用户身份剥除他人公开相册；此处再按 ownerId
     兜底一道（防御 + 让 AdminShell / 子组件无须再做角色分支）。 */
  const scoped = {
    ...data,
    albums: data.albums.filter((a) => a.ownerId === me.id),
    photos: data.photos.filter((p) => p.ownerId === me.id),
  };

  /* 批 3.2 新增: photos tab 客户端搜索 + 按相册筛选 (无后端,
     仅 client-side 过滤 title/caption/place + albumId)
     必须在 visible 之前声明 (visible useMemo 引用) */
  const [photoSearch, setPhotoSearch] = useState("");
  const [photoAlbumFilter, setPhotoAlbumFilter] = useState("");

  /* photos tab 子筛选：all → 非回收站；trash → 仅回收站 */
  const photoSubtab: "all" | "trash" =
    tab === "photos" ? photoFilter : "all";

  /* 当前可见 photos 中已选的数量 —— 必须用 scoped.photos（已按 ownerId
     过滤），不能用 data.photos（包含他人 ownerId 的公开照片）。
     这里若用 data.photos 算出"4 张已选"是因为 stale selectedIds 里还残留
     别的 owner 的 public photo id，UI 把按钮文案"移入回收站 4 张"骗给用户。
     修复后 liveSelectedCount 跟 visible 同源，按钮文案与实际能操作的张数一致。 */
  const liveSelectedCount = useMemo(() => {
    const ids = new Set(selectedIds);
    return scoped.photos.filter(
      (p) =>
        ids.has(p.id) &&
        (photoSubtab === "all" ? !p.trashedAt : !!p.trashedAt),
    ).length;
  }, [scoped.photos, selectedIds, photoSubtab]);

  const visible = useMemo(() => {
    const base = scoped.photos.filter((p) =>
      photoSubtab === "all" ? !p.trashedAt : !!p.trashedAt,
    );
    const q = photoSearch.trim().toLowerCase();
    return base
      .filter((p) => !photoAlbumFilter || p.albumId === photoAlbumFilter)
      .filter(
        (p) =>
          !q ||
          p.title?.toLowerCase().includes(q) ||
          p.caption?.toLowerCase().includes(q) ||
          p.place?.toLowerCase().includes(q),
      );
  }, [scoped.photos, photoSubtab, photoSearch, photoAlbumFilter]);
  const trashedCount = scoped.photos.filter((p) => !!p.trashedAt).length;
  const photoCount = scoped.photos.length - trashedCount;
  const albumCount = scoped.albums.length;

  /* 顶部 decoCard 缩略图：取自己最近 3 张非回收站 photo，签名 URL 走
     fetchPhotoUrl（15min TTL 缓存 + 自动刷新），失败 fallback 留空 src
     让 .decoPhoto 渐变背景兜底。0 张时不渲染 decoStack 段。

     坑：scoped.photos 每次 render 都是新数组（filter 出来的），
     直接 useMemo[scoped.photos] 引用每次都变 → useEffect[recentPhotos]
     每次都跑 → setThumbUrls 触发 re-render → 死循环。改成"按 photoId
     序列化的字符串"做依赖，引用稳定。 */
  const recentPhotos = useMemo(
    () => scoped.photos.filter((p) => !p.trashedAt).slice(0, 3),
    [scoped.photos],
  );

  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    void Promise.all(
      recentPhotos.map(async (p) => {
        try {
          const url = await fetchPhotoUrl(p.id, "thumb");
          return [p.id, url ?? ""] as const;
        } catch {
          return [p.id, ""] as const;
        }
      }),
    ).then((entries) => {
      if (cancelled) return;
      const next: Record<string, string> = {};
      for (const [id, url] of entries) next[id] = url;
      setThumbUrls(next);
    });
    return () => {
      cancelled = true;
    };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [recentPhotos.map((p) => p.id).join("|")]);

  /* sidebar nav 项（按角色裁剪）：
     viewer：home / photos / albums 三项；
     admin：在 albums 之后追加 users（用户管理），再追加 system（系统设置）。 */
  const navItems: Array<{
    key: AdminTab;
    label: string;
    count?: number;
  }> = [
    { key: "home", label: "首页" },
    { key: "photos", label: "照片管理", count: photoCount },
    { key: "albums", label: "相册分类", count: albumCount },
  ];
  if (me.role === "admin") {
    navItems.push({ key: "users", label: "用户管理" });
    navItems.push({ key: "system", label: "系统设置" });
  }

  const heroUser = me.displayName || me.username || "管理员";

  /* 头像首字母（mono / 取 username 第一字） */
  const avatarLetter =
    (me.username || me.displayName || "?").trim().slice(0, 1).toUpperCase();

  return (
    <div className={styles.layoutRoot}>
      {/* ---------- 左侧 sidebar ---------- */}
      <aside className={styles.sidebar} aria-label="侧边导航">
        <div className={styles.sidebarTop}>
          <span className={styles.sidebarLogo}>相</span>
          <span className={styles.sidebarTitle}>相册后台</span>
        </div>

        <nav className={styles.sidebarNav}>
          <span className={styles.navLabel}>导航</span>
          {navItems.map((it) => (
            <button
              key={it.key}
              type="button"
              className={`${styles.navItem} ${tab === it.key ? styles.navItemOn : ""}`}
              onClick={() => onTab(it.key)}
            >
              <span>{it.label}</span>
              {typeof it.count === "number" ? (
                <span className={styles.navCount}>{it.count}</span>
              ) : null}
            </button>
          ))}
        </nav>

        <div className={styles.sidebarFoot}>
          <span className={styles.sidebarStatus}>
            <span className={styles.sidebarStatusDot} aria-hidden />
            系统运行正常
          </span>
          <span className={styles.sidebarVersion}>v1.0.0</span>
        </div>
      </aside>

      {/* ---------- 右侧 main ---------- */}
      <div className={styles.main}>
        {/* TopBar */}
        <header className={styles.topBar}>
          <label className={styles.topBarSearch}>
            <svg
              className={styles.topBarSearchIcon}
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden
            >
              <circle
                cx="7"
                cy="7"
                r="5.5"
                stroke="currentColor"
                strokeWidth="1.4"
              />
              <path
                d="m11 11 3.5 3.5"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
            <input
              type="text"
              className={styles.topBarSearchInput}
              placeholder="搜索照片、相册、标签..."
            />
          </label>
          <div className={styles.topBarRight}>
            <button
              type="button"
              className={styles.topBarBell}
              aria-label="通知"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                aria-hidden
              >
                <path
                  d="M3.5 11h9l-1-1.2V7a3.5 3.5 0 1 0-7 0v2.8L3.5 11Z"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinejoin="round"
                />
                <path
                  d="M6.5 13.5a1.5 1.5 0 0 0 3 0"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
            <button
              type="button"
              className={styles.topBarAvatarBtn}
              aria-label={`当前用户 ${heroUser}`}
            >
              <span className={styles.topBarAvatar}>{avatarLetter}</span>
              <span className={styles.topBarAvatarDot} aria-hidden />
            </button>
            <span className={styles.topBarActions}>
              <a href="/" className={styles.topBarAction}>
                返回首页
              </a>
              <button
                type="button"
                className={styles.topBarAction}
                onClick={() => void onLogout()}
              >
                退出
              </button>
            </span>
          </div>
        </header>

        {/* 顶部装饰 banner（home / photos / albums 三个 tab 都显示；放最上方） */}
        {tab !== "system" ? (
          <aside className={styles.decoCard}>
            <div className={styles.decoCopy}>
              <span className={styles.decoKicker}>今日灵感</span>
              <span className={styles.decoHeadline}>
                让每一张照片都有归属
              </span>
              <p className={styles.decoSub}>
                上传、归类、设置封面——几秒钟让一组作品成册。
              </p>
            </div>
            {recentPhotos.length > 0 ? (
              <div className={styles.decoStack}>
                {recentPhotos.map((p) => (
                  <div key={p.id} className={styles.decoPhoto}>
                    {thumbUrls[p.id] ? (
                      <img src={thumbUrls[p.id]} alt="" loading="lazy" />
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
          </aside>
        ) : null}

        {/* ---------- home tab: notice（DropZone 上方）+ 目标相册选择器 + 大上传 ---------- */}
        {tab === "home" ? (
          <>
            {notice ? (
              <section className={styles.homeNotice}>
                <p className={notice.kind === "ok" ? styles.ok : styles.err}>
                  {notice.text}
                </p>
              </section>
            ) : null}
            <div className={styles.uploadTarget}>
              <label className={styles.uploadTargetLabel}>
                上传到
              </label>
              <select
                className={styles.uploadTargetSelect}
                value={targetAlbumId ?? fallbackAlbum?.id ?? ""}
                onChange={(e) =>
                  onChangeTargetAlbum(e.target.value || null)
                }
              >
                {myAlbums.length === 0 && fallbackAlbum ? (
                  <option value={fallbackAlbum.id}>
                    {fallbackAlbum.name}
                  </option>
                ) : null}
                {myAlbums.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className={styles.uploadTargetNew}
                onClick={() => {
                  onTab("albums");
                  onCreateAlbum?.();
                }}
              >
                + 新建
              </button>
            </div>

            <DropZone
              onFiles={(fs) => void onAddFiles(fs)}
              busy={false}
              pending={pendingCount}
            />

            {/* 批 3.1：照片空间概览（4 个 stat card）+ 最近照片网格。
                recentPhotos / thumbUrls 已在上面 hook 算好 + useEffect 拿签名 URL,
                这里直接复用,不另开 fetch。data.updatedAt 是 manifest 顶层 ISO,
                渲染时 formatUpdatedAt 转 YYYY-MM-DD HH:MM,失败 fallback "—"。 */}
            <section className={styles.homeStats} aria-label="照片空间概览">
              <header className={styles.pageHeader}>
                <h2 className={styles.pageTitle}>照片空间</h2>
                <span className={styles.pageSub}>
                  最后更新 {formatUpdatedAt(data.updatedAt)}
                </span>
              </header>
              <div className={styles.statGrid}>
                <article className={`${styles.card} ${styles.statCard}`}>
                  <span className={styles.statValue}>{photoCount}</span>
                  <span className={styles.statLabel}>照片</span>
                </article>
                <article className={`${styles.card} ${styles.statCard}`}>
                  <span className={styles.statValue}>{albumCount}</span>
                  <span className={styles.statLabel}>相册</span>
                </article>
                <article className={`${styles.card} ${styles.statCard}`}>
                  <span className={styles.statValue}>{trashedCount}</span>
                  <span className={styles.statLabel}>回收站</span>
                </article>
                <article className={`${styles.card} ${styles.statCard}`}>
                  <span className={styles.statValue}>{myAlbums.length}</span>
                  <span className={styles.statLabel}>我的相册</span>
                </article>
              </div>
            </section>

            <section className={styles.section} aria-label="最近照片">
              <header className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>最近照片</h2>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnGhost}`}
                  onClick={() => onTab("photos")}
                >
                  查看全部 →
                </button>
              </header>
              {recentPhotos.length > 0 ? (
                <div className={styles.recentGrid}>
                  {recentPhotos.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className={`${styles.card} ${styles.recentCell}`}
                      onClick={() => onTab("photos")}
                      aria-label={`查看 ${p.title || p.id}`}
                    >
                      <div className={styles.recentThumb}>
                        {thumbUrls[p.id] ? (
                          <img src={thumbUrls[p.id]} alt="" loading="lazy" />
                        ) : null}
                      </div>
                      <div className={styles.recentMeta}>
                        {/* 首页最近照片卡片不显文件名 (Photo.title
                            默认是 file.name 去后缀 — 用户不要)
                            只留 shotAt; title 字段保留供 photos 网格用 */}
                        <span className={styles.recentDate}>
                          {p.shotAt || "—"}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className={styles.emptyState}>
                  <h3 className={styles.emptyStateTitle}>还没有照片</h3>
                  <p className={styles.emptyStateBody}>
                    拖文件到上方 DropZone 上传，或点上传区按钮选择文件。
                  </p>
                </div>
              )}
            </section>
          </>
        ) : null}

        {/* 全局 notice（非 home tab 显示——home tab 内已在 DropZone 上方渲染） */}
        {notice && tab !== "home" ? (
          <section className={styles.content}>
            <p className={notice.kind === "ok" ? styles.ok : styles.err}>
              {notice.text}
            </p>
          </section>
        ) : null}

        {/* ---------- photos tab: toolbar + 子筛选 + 瀑布 ---------- */}
        {tab === "photos" ? (
          <section className={styles.content}>
            {/* 批 3.2 新增：toolbar 段（pageHeader + 搜索 + 相册筛选） */}
            <header className={styles.photosToolbar}>
              <div className={styles.pageHeader}>
                <h2 className={styles.pageTitle}>照片</h2>
                <span className={styles.pageSub}>
                  {liveSelectedCount > 0
                    ? `已选 ${liveSelectedCount} / ${photoCount}`
                    : `共 ${photoCount} 张`}
                </span>
              </div>
              <div className={styles.toolbarSpacer} />
              <input
                type="search"
                className={`${styles.input} ${styles.photosSearch}`}
                placeholder="搜索标题、说明、地点…"
                value={photoSearch}
                onChange={(e) => setPhotoSearch(e.target.value)}
                aria-label="搜索照片"
              />
              <select
                className={`${styles.input} ${styles.photosAlbumFilter}`}
                value={photoAlbumFilter}
                onChange={(e) => setPhotoAlbumFilter(e.target.value)}
                aria-label="按相册筛选"
              >
                <option value="">所有相册</option>
                {scoped.albums.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </header>

            <div className={styles.subTabs}>
              <label
                className={`${styles.subTabSelectAll} ${
                  allChecked ? styles.subTabSelectAllOn : ""
                }`}
                title={
                  allChecked
                    ? "全部恢复（取消当前可见已选）"
                    : "全选当前可见"
                }
              >
                <input
                  type="checkbox"
                  checked={allChecked}
                  ref={(el) => {
                    if (el) el.indeterminate = someChecked && !allChecked;
                  }}
                  onChange={() => onSelectAll?.()}
                  aria-label="全选当前可见"
                />
                <span>
                  {allChecked
                    ? "已全选（点全部恢复）"
                    : someChecked
                      ? "部分选中"
                      : "全选"}
                </span>
              </label>
              <button
                className={`${styles.btn} ${styles.subTabBtn} ${photoSubtab === "all" ? styles.subTabOn : ""}`}
                onClick={() => setPhotoFilter("all")}
              >
                全部 {photoCount}
              </button>
              <button
                className={`${styles.btn} ${styles.subTabBtn} ${photoSubtab === "trash" ? styles.subTabOn : ""}`}
                onClick={() => setPhotoFilter("trash")}
              >
                回收站 {trashedCount}
              </button>
              {liveSelectedCount > 0 && photoSubtab === "all" ? (
                <>
                  <button
                    className={`${styles.btn} ${styles.btnGhost}`}
                    onClick={() => onSelectAll?.()}
                  >
                    清除选择
                  </button>
                  <button
                    className={`${styles.btn} ${styles.btnDanger}`}
                    onClick={() => void onTrashSelected()}
                    style={{ marginLeft: "auto" }}
                  >
                    移入回收站 {liveSelectedCount} 张
                  </button>
                </>
              ) : liveSelectedCount > 0 && photoSubtab === "trash" ? (
                <>
                  <button
                    className={`${styles.btn} ${styles.btnGhost}`}
                    onClick={() => onSelectAll?.()}
                  >
                    清除选择
                  </button>
                  <button
                    className={`${styles.btn} ${styles.btnPrimary}`}
                    onClick={() => void onRestoreSelected()}
                    style={{ marginLeft: "auto" }}
                  >
                    恢复 {liveSelectedCount} 张
                  </button>
                </>
              ) : null}
            </div>

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
                        className={`${styles.btn} ${styles.btnGhost}`}
                        onClick={() => void onRetryUpload(it)}
                      >
                        重试
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}

            {/* 收紧空状态 — 复用批 1 .emptyState 思路, 批 3.2 单独 class 以适配 photos 上下文 */}
            {visible.length === 0 ? (
              <div className={styles.photosEmpty}>
                <h3 className={styles.photosEmptyTitle}>
                  {photoSubtab === "trash"
                    ? "回收站是空的"
                    : photoSearch || photoAlbumFilter
                      ? "没有匹配的照片"
                      : "还没有照片"}
                </h3>
                <p className={styles.photosEmptyBody}>
                  {photoSubtab === "trash"
                    ? "已删除的照片会显示在这里。"
                    : photoSearch || photoAlbumFilter
                      ? "试试调整搜索或筛选条件。"
                      : "拖文件到 Home tab 上传，或点上传按钮选择文件。"}
                </p>
                {photoSubtab === "all" && !photoSearch && !photoAlbumFilter ? (
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnPrimary}`}
                    onClick={() => onTab("home")}
                  >
                    前往上传
                  </button>
                ) : null}
              </div>
            ) : (
              <AdminPhotoGrid
                photos={visible}
                albums={scoped.albums}
                selectedIds={selectedIds}
                onToggleSelected={onToggleSelected}
                onEditPhoto={(id, patch) => void onEditPhoto(id, patch)}
                onRestore={(id) => void onRestore(id)}
                onPurge={(id) => void onPurge(id)}
                onJumpAlbums={onJumpAlbums}
                inTrash={photoSubtab === "trash"}
              />
            )}
          </section>
        ) : null}

        {/* ---------- albums tab ---------- */}
        {tab === "albums" ? (
          <section className={styles.content}>
            <AlbumsTab
              me={me}
              albums={scoped.albums}
              photos={scoped.photos}
              onEdit={onEditAlbum}
              onCreate={onCreateAlbum}
              onSetCover={onSetAlbumCover ?? onOpenCover}
              onDelete={onDeleteAlbum}
              onDeleteConfirm={
                onRequestConfirm
                  ? (a: Album) =>
                      onRequestConfirm({
                        title: `删除相册「${a.name}」`,
                        body:
                          "该相册的非回收站照片会转入「回收相册」。\n回收站照片不动。",
                        danger: true,
                        confirmLabel: "删除",
                      })
                  : undefined
              }
              busy={!!props.albumsBusy}
              msg={props.albumsMsg ?? null}
            />
          </section>
        ) : null}

        {/* ---------- users tab (admin-only) ---------- */}
        {tab === "users" && me.role === "admin" ? (
          <section className={styles.content}>
            <UsersTab me={me} onSetCoverAlbum={onOpenCover} />
          </section>
        ) : null}

        {/* ---------- system tab (admin-only) ---------- */}
        {tab === "system" && me.role === "admin" ? (
          <section className={styles.content}>
            <CoversPanel
              data={data}
              onOpenCover={onOpenCover}
            />
          </section>
        ) : null}
      </div>
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
}: {
  data: Manifest;
  onOpenCover: (a: Album) => void;
}) {
  return (
    <section className={styles.content}>
      {/* 批 3.5: pageHeader + section + card 模式, 与 Albums/Users/Photos tab 视觉一致 */}
      <header className={styles.pageHeader}>
        <h2 className={styles.pageTitle}>系统设置</h2>
        <span className={styles.pageSub}>首页作品集封面</span>
      </header>

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
    </section>
  );
}

/* ---------- helpers (本文件内部使用) ---------- */

/** ISO 字符串 → "YYYY-MM-DD HH:MM"，失败 / 空 fallback "—" */
function formatUpdatedAt(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
