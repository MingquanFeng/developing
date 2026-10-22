"use client";

/**
 * AdminApp —— 后台总控（协调器）
 * ------------------------------------------------------------------
 * 单一职责：把 hooks 拼起来、把 action 编排起来、把渲染分给子组件。
 *
 * 状态分布：
 *   session / manifest / upload / cover  —— 各自 hook
 *   tab / selected / shellNotice / photoFilter —— 本组件
 *   albumPanel（editing/creating/busy/msg）—— useAlbumsPanel
 *   整页拖拽监听 —— useGlobalFileDrop
 *
 * 对外签名不变（<AdminApp />）。app/admin/page.tsx 不需要改。
 *
 * ⚠️ 边界：本文件 import 一切运行时依赖，但**不再写业务逻辑**——
 *   - 任何 setState 必须有它的 hook / 子组件归属
 *   - 任何渲染分支必须有一一对应的 child component
 *   - 见到新的 useState 时停下来问"是不是该属于某个 hook？"
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import CoverModal from "./modals/CoverModal";
import AlbumEditModal from "./modals/AlbumEditModal";
import ConfirmModal from "./modals/ConfirmModal";
import AdminShell, { type AdminTab } from "./AdminShell";
import LoginForm from "./LoginForm";
import { Block, Frame } from "./Frame";

import { useAdminSession } from "./hooks/useAdminSession";
import { useManifest } from "./hooks/useManifest";
import { useUploadQueue } from "./hooks/useUploadQueue";
import { useCoverModal } from "./hooks/useCoverModal";
import { useAlbumsPanel } from "./hooks/useAlbumsPanel";
import { useGlobalFileDrop } from "./hooks/useGlobalFileDrop";
import { useSiteContent } from "./system/useSiteContent";
import { defaultAlbum } from "./hooks/useManifest";

import { patchPhoto, purgePhoto, restorePhoto, trashPhoto } from "@/lib/admin-api";
import type { Album, Manifest, Photo, PublicUser } from "@/lib/contracts";
import type { SiteContentVersion, SiteSectionKey } from "@/lib/contracts";
import { type SessionStatus } from "./hooks/useAdminSession";

/**
 * 计算 viewer / admin 应能看到的相册子集 —— helper 函数接 session 作为参数
 * （不让 TS narrowing 泄漏到外部 session.status）。
 */
function calcMyAlbums(
  data: Manifest,
  session: { status: SessionStatus; me: PublicUser | null },
): Album[] {
  if (session.status !== "authed") return [];
  const u = session.me;
  if (!u) return [];
  return u.role === "admin"
    ? data.albums
    : data.albums.filter((a) => a.ownerId === u.id);
}

export type AdminAppProps = {
  /** server component 在 SSR 阶段从 cookie 解析的 user。
   *  没有则 client 端探活补上。 */
  initialMe?: PublicUser | null;
};

export default function AdminApp({ initialMe = null }: AdminAppProps = {}) {
  const session = useAdminSession({ initialMe });
  const manifest = useManifest({ enabled: session.status === "authed" });
  const cover = useCoverModal();
  const siteContent = useSiteContent({
    enabled: session.status === "authed",
    isAdmin: session.me?.role === "admin",
  });

  const [tab, setTab] = useState<AdminTab>("home");
  const [photoFilter, setPhotoFilter] = useState<"all" | "trash">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [shellNotice, setShellNotice] = useState<
    { kind: "ok" | "err"; text: string } | null
  >(null);
  /* notice 5 秒后自动消失 —— 任何 tab 都能短暂看到反馈 */
  useEffect(() => {
    if (!shellNotice) return;
    const t = setTimeout(() => setShellNotice(null), 5000);
    return () => clearTimeout(t);
  }, [shellNotice]);

  /* ---------- 通用 confirm 弹层 ----------
     把 window.confirm 收口到这里：单一 state 串行化所有请求（resolve 后
     才允许下一个），下游组件拿到的只是 Promise<boolean>。 */
  const [confirmReq, setConfirmReq] = useState<{
    title: string;
    body: string;
    danger?: boolean;
    confirmLabel?: string;
    cancelLabel?: string;
    resolve: (v: boolean) => void;
  } | null>(null);
  const requestConfirm = useCallback(
    (opts: {
      title: string;
      body: string;
      danger?: boolean;
      confirmLabel?: string;
      cancelLabel?: string;
    }) =>
      new Promise<boolean>((resolve) => {
        setConfirmReq({ ...opts, resolve });
      }),
    [],
  );

  /* session.me 在 anonymous 时为 null —— 用占位撑住 hook 顺序；匿名态
     不会进 albums 分支，下面的 save/setShellNotice 等真实 use 都在登录态。 */
  const albumPanel = useAlbumsPanel({
    me: (session.me ?? ({ id: "anon" } as PublicUser)),
    save: async (m) => manifest.save(m),
    setShellNotice,
  });

  /* ---------- 上传目标相册选择 ----------
     targetAlbumId 默认选自己的第一个相册；用户可在 DropZone 上方切换。
     当 myAlbums 为空时：上传到「默认相册」（自动建一条）—— 用
     fallbackAlbum 提前算好传给 useUploadQueue，避免 hook 内再请求 manifest。 */
  const [targetAlbumId, setTargetAlbumId] = useState<string | null>(null);
  const fallbackAlbum = useMemo(() => {
    const meId = session.me?.id;
    if (!meId) return null;
    const my = manifest.data.albums.filter((a) => a.ownerId === meId);
    if (my.length === 0) return defaultAlbum(meId, manifest.data.albums);
    return my[0];
  }, [manifest.data.albums, session.me]);

  /* 让 selected 始终存在（targetAlbumId 落在 myAlbums/fallbackAlbum） */
  const effectiveTargetAlbumId =
    targetAlbumId ?? fallbackAlbum?.id ?? null;

  const upload = useUploadQueue({
    me: session.me,
    save: async (m) => {
      await manifest.save(m);
    },
    onNotice: setShellNotice,
    targetAlbumId: effectiveTargetAlbumId,
    fallbackAlbum,
  });

  /* ---------- 整页 window-level 拖拽监听：所有 nav 都能响应文件拖入 ---------- */
  useGlobalFileDrop({
    onFiles: (fs) => void upload.addFiles(fs),
  });

  /* ---------- actions：所有写在 AdminApp 里供子组件 callback ---------- */

  /** 单张照片编辑。isPublic 单独走 PATCH（高频 + 不撞乐观锁）。 */
  const onEditPhoto = useCallback(
    async (id: string, patch: Partial<Photo>) => {
      if (
        patch.isPublic !== undefined &&
        Object.keys(patch).length === 1
      ) {
        try {
          const { photo, revision } = await patchPhoto(id, {
            isPublic: patch.isPublic,
          });
          await manifest.save((prev) => ({
            ...prev,
            revision,
            photos: prev.photos.map((p) =>
              p.id === id ? photo : p,
            ),
          }));
        } catch (e) {
          setShellNotice({ kind: "err", text: (e as Error).message });
        }
        return;
      }
      try {
        await manifest.save((prev) => ({
          ...prev,
          photos: prev.photos.map((p) =>
            p.id === id ? { ...p, ...patch } : p,
          ),
        }));
      } catch (e) {
        setShellNotice({ kind: "err", text: (e as Error).message });
      }
    },
    [manifest],
  );

  const onTrashOne = useCallback(async (id: string) => {
    try {
      await trashPhoto(id);
    } catch (e) {
      setShellNotice({ kind: "err", text: (e as Error).message });
    }
  }, []);

  const onTrashMany = useCallback(
    async (ids: readonly string[]) => {
      /* 严格 owner 隔离：admin 与 viewer 同权，只动自己 ownerId 的照片 */
      const meId = session.me?.id;
      const myIds = meId
        ? ids.filter((id) =>
            manifest.data.photos.some(
              (p) => p.id === id && p.ownerId === meId,
            ),
          )
        : [];
      if (myIds.length === 0) {
        setShellNotice({ kind: "err", text: "所选照片中没有属于你的" });
        setSelected(new Set());
        return;
      }
      for (const id of myIds) await onTrashOne(id);
      await manifest.reload();
      setSelected(new Set());
      setShellNotice({ kind: "ok", text: `已移入回收站 ${myIds.length} 张` });
    },
    [manifest, onTrashOne, session.me],
  );

  const onRestore = useCallback(
    async (id: string) => {
      try {
        await restorePhoto(id);
      } catch (e) {
        setShellNotice({ kind: "err", text: (e as Error).message });
        return;
      }
      await manifest.reload();
      setShellNotice({ kind: "ok", text: "已恢复" });
    },
    [manifest],
  );

  const onRestoreMany = useCallback(
    async (ids: readonly string[]) => {
      /* 同 onTrashMany：先按 owner 过滤再循环 */
      const meId = session.me?.id;
      const myIds = meId
        ? ids.filter((id) =>
            manifest.data.photos.some(
              (p) => p.id === id && p.ownerId === meId,
            ),
          )
        : [];
      if (myIds.length === 0) {
        setShellNotice({ kind: "err", text: "所选照片中没有属于你的" });
        setSelected(new Set());
        return;
      }
      for (const id of myIds) await onRestore(id);
      await manifest.reload();
      setSelected(new Set());
      setShellNotice({ kind: "ok", text: `已恢复 ${myIds.length} 张` });
    },
    [manifest, onRestore, session.me],
  );

  const onPurge = useCallback(
    async (id: string) => {
      /* 严格 owner 隔离：purge 前校验 data.photos 归属；与后端
         requirePhotoOwner（403 not_yours）构成纵深防御 */
      const meId = session.me?.id;
      const photo = meId
        ? manifest.data.photos.find(
            (p) => p.id === id && p.ownerId === meId,
          )
        : null;
      if (!photo) {
        setShellNotice({ kind: "err", text: "权限不足：照片不属于你" });
        return;
      }
      try {
        await purgePhoto(id);
      } catch (e) {
        setShellNotice({ kind: "err", text: (e as Error).message });
        return;
      }
      await manifest.reload();
      setShellNotice({ kind: "ok", text: "已彻底删除" });
    },
    [manifest, session.me],
  );

  const onCoverPick = useCallback(
    async (key: string) => {
      if (!cover.coverAlbum) return;
      await cover.saveCover(cover.coverAlbum, key);
      /* 把刚选中的 coverKey 同步给 albumPanel.editing (若弹层开着) */
      const cur = albumPanel.editing;
      if (cur && cur.id === cover.coverAlbum.id) {
        albumPanel.setCover(cur, key);
      }
      await manifest.reload();
    },
    [cover, manifest, albumPanel],
  );

  const onCoverClear = useCallback(async () => {
    if (!cover.coverAlbum) return;
    await cover.saveCover(cover.coverAlbum, null);
    const cur = albumPanel.editing;
    if (cur && cur.id === cover.coverAlbum.id) {
      albumPanel.setCover(cur, null);
    }
    await manifest.reload();
  }, [cover, manifest, albumPanel]);

  /** Albums tab 内的"选封面"按钮回调：直接打开已有 useCoverModal，
   *  共享 CoverModal 组件，避免拆分。 */
  const onSetAlbumCover = useCallback(
    (a: Album) => cover.openCover(a),
    [cover],
  );

  /* 首页内容编辑 —— useSiteContent 的 thin wrapper。
     把错误透给顶部 shellNotice，200 成功时 reload() 一次拿最新 meta。
     basedOnId 决定新版本是基于哪一版改的（版本链）。 */
  const onSaveSection = useCallback(
    async (
      key: SiteSectionKey,
      content: unknown,
      basedOnId?: number | null,
    ): Promise<{ versionId: number }> => {
      try {
        const r = await siteContent.save(key, content, basedOnId);
        await siteContent.reload();
        setShellNotice({
          kind: "ok",
          text: `已保存 ${key}，首页将自动更新`,
        });
        return { versionId: r.versionId };
      } catch (e) {
        setShellNotice({ kind: "err", text: (e as Error).message });
        throw e;
      }
    },
    [siteContent],
  );

  const onResetSection = useCallback(
    async (key: SiteSectionKey): Promise<{ versionId: number }> => {
      try {
        const r = await siteContent.reset(key);
        await siteContent.reload();
        setShellNotice({
          kind: "ok",
          text: `已重置 ${key} 为默认`,
        });
        return { versionId: r.versionId };
      } catch (e) {
        setShellNotice({ kind: "err", text: (e as Error).message });
        throw e;
      }
    },
    [siteContent],
  );

  /* 恢复历史版本 —— 把那一版的内容原样再发一版（旧的仍在历史里）。 */
  const onRestoreSection = useCallback(
    async (
      version: SiteContentVersion,
    ): Promise<{ versionId: number }> => {
      try {
        const r = await siteContent.restore(version);
        await siteContent.reload();
        setShellNotice({
          kind: "ok",
          text: `已恢复 ${version.key} 的版本 #${version.id}`,
        });
        return { versionId: r.versionId };
      } catch (e) {
        setShellNotice({ kind: "err", text: (e as Error).message });
        throw e;
      }
    },
    [siteContent],
  );

  /* 版本历史拉失败时的重试（只刷版本流，不动内容本身）。 */
  const onReloadVersions = useCallback(() => {
    void siteContent.loadVersions();
  }, [siteContent]);

  const onLogout = useCallback(async () => {
    await session.logout();
    setShellNotice(null);
    setSelected(new Set());
    setTab("home");
  }, [session]);

  const onToggleSelected = useCallback((id: string) => {
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }, []);

  /* EditLightbox 内的"管理相册"按钮回调：跳到 albums tab */
  const onJumpAlbums = useCallback(() => {
    setTab("albums");
    setShellNotice(null);
  }, []);

  /* ---------- 全选/取消全选 ----------
     当前可见 photos（按 photoFilter all/trash 过滤后）整批切换。
     三态：全不选 → 全选；全选 → 全不选；部分选 → 全选（覆盖）。 */
  const photoSubtab: "all" | "trash" =
    tab === "photos" ? photoFilter : "all";
  /* 当前可见 photos 的 id 列表 —— 必须按 ownerId 兜底过滤,否则 manifest
     里残留其他用户的 public photo id 会让"全选""移入回收站"按钮误导 UI
     看到选中 4 张但实际全是他人照片。AdminApp 三态分流已保证此时
     session.status === 'authed' && session.me 非空。 */
  const visiblePhotoIds = useMemo(
    () => {
      /* useMemo 早于三态 early return 定义,不能假设 session.me 非空。
         anonymous / loading 时返回空数组 —— 全选/移入回收站按钮自然
         因 liveSelectedCount=0 不显示,逻辑层无副作用。 */
      const meId = session.me?.id;
      if (!meId) return [];
      return manifest.data.photos
        .filter((p) => p.ownerId === meId)
        .filter((p) =>
          photoSubtab === "all" ? !p.trashedAt : !!p.trashedAt,
        )
        .map((p) => p.id);
    },
    [manifest.data.photos, photoSubtab, session.me],
  );
  const allChecked =
    visiblePhotoIds.length > 0 &&
    visiblePhotoIds.every((id) => selected.has(id));
  const someChecked =
    !allChecked && visiblePhotoIds.some((id) => selected.has(id));
  /* 当前可见 photos 中已选的数量（只算当前 subtab，避免切 trash 时还显示 all 数） */
  const visibleSelectedCount = visiblePhotoIds.reduce(
    (n, id) => (selected.has(id) ? n + 1 : n),
    0,
  );
  const onSelectAll = useCallback(() => {
    /* 三态 toggle：
       - 全不选/部分选 → 全选（增）
       - 全选 → 全不选（减/全部恢复） */
    setSelected((prev) => {
      const next = new Set(prev);
      if (allChecked) {
        for (const id of visiblePhotoIds) next.delete(id);
      } else {
        for (const id of visiblePhotoIds) next.add(id);
      }
      return next;
    });
  }, [allChecked, visiblePhotoIds]);

  /* ---------- 三态分发 ---------- */
  if (session.status === "loading") {
    return (
      <Frame>
        <Block title="正在检查登录状态">
          <p>—</p>
        </Block>
      </Frame>
    );
  }

  if (session.status === "anonymous") {
    return (
      <LoginForm
        username={session.username}
        password={session.password}
        busy={session.busy}
        error={session.error}
        onUsernameChange={session.setUsername}
        onPasswordChange={session.setPassword}
        onSubmit={session.login}
      />
    );
  }

  /* myAlbums 之前用 useMemo 在早期 return 之前，引起 hooks 顺序变化（React dev mode 报
     "change in order of Hooks"）。改为 inline 计算 —— 不是 hook，可放在
     早期 return 之后；同时 helper 函数 calcMyAlbums 仍可复用 */
  const data: Manifest = manifest.data;

  /* ---------- 三态分发 ----------
     `as SessionStatus` cast 防止 TS 控制流分析 narrowing 外层 session.status
     到 'authed'（后续比较报 dead code）。runtime 行为不受影响。 */
  const status = session.status as SessionStatus;
  if (status === "loading") {
    return (
      <Frame>
        <Block title="正在检查登录状态">
          <p>—</p>
        </Block>
      </Frame>
    );
  }

  if (status === "anonymous") {
    return (
      <LoginForm
        username={session.username}
        password={session.password}
        busy={session.busy}
        error={session.error}
        onUsernameChange={session.setUsername}
        onPasswordChange={session.setPassword}
        onSubmit={session.login}
      />
    );
  }

  /* 弹层关闭的回调：creator / editor 各自拿一份 */
  const closeModal = () => albumPanel.close();

  /* 此处 status === 'authed'（TS 推断；session.me 非空） */
  const me: PublicUser = session.me!;
  const myAlbums = calcMyAlbums(data, session);

  return (
    <>
      <AdminShell
        me={me}
        data={data}
        tab={tab}
        photoFilter={photoFilter}
        setPhotoFilter={setPhotoFilter}
        notice={shellNotice}
        uploadQueue={upload.queue}
        pendingCount={upload.queue.filter((q) => q.status !== "done").length}
        selectedIds={selected}
        allChecked={allChecked}
        someChecked={someChecked}
        onSelectAll={onSelectAll}
        targetAlbumId={effectiveTargetAlbumId}
        myAlbums={myAlbums}
        fallbackAlbum={fallbackAlbum}
        onChangeTargetAlbum={setTargetAlbumId}
        onTab={setTab}
        onAddFiles={upload.addFiles}
        onRetryUpload={upload.retry}
        onLogout={onLogout}
        onTrashSelected={() => onTrashMany([...selected])}
        onRestoreSelected={() => onRestoreMany([...selected])}
        onEditPhoto={onEditPhoto}
        onRestore={onRestore}
        onPurge={onPurge}
        onToggleSelected={onToggleSelected}
        onOpenCover={cover.openCover}
        onEditAlbum={(a) => albumPanel.openEdit(a)}
        onCreateAlbum={() => albumPanel.openCreate()}
        onDeleteAlbum={(id) => void albumPanel.deleteAlbum(id)}
        onSetAlbumCover={onSetAlbumCover}
        onJumpAlbums={onJumpAlbums}
        albumsBusy={albumPanel.busy}
        albumsMsg={albumPanel.msg}
        onRequestConfirm={requestConfirm}
        siteContent={siteContent.data}
        siteContentBusy={siteContent.busy}
        siteContentLoading={siteContent.loading}
        siteContentLoadErr={siteContent.loadErr}
        siteContentVersions={siteContent.versions}
        siteContentVersionsLoading={siteContent.versionsLoading}
        siteContentVersionsErr={siteContent.versionsErr}
        onSaveSection={onSaveSection}
        onResetSection={onResetSection}
        onRestoreSection={onRestoreSection}
        onReloadVersions={onReloadVersions}
      />

      {cover.coverAlbum ? (
        <CoverModal
          album={cover.coverAlbum}
          photos={data.photos.filter(
            (p) => p.albumId === cover.coverAlbum!.id && !p.trashedAt,
          )}
          busy={cover.coverBusy}
          onPick={onCoverPick}
          onClear={onCoverClear}
          onClose={cover.closeCover}
        />
      ) : null}

      {/* Albums 编辑 / 新建弹层 */}
      {albumPanel.editing ? (
        <AlbumEditModal
          mode="edit"
          album={albumPanel.editing}
          photos={data.photos.filter(
            (p) =>
              p.albumId === albumPanel.editing!.id && !p.trashedAt,
          )}
          fallbackAlbums={data.albums}
          ownerId={me.id}
          busy={albumPanel.busy}
          onClose={closeModal}
          onPatch={(id, partial) => albumPanel.patch(id, partial)}
          onDelete={(id) => albumPanel.deleteAlbum(id)}
          onSetCover={(a) => cover.openCover(a)}
          onRequestConfirm={requestConfirm}
        />
      ) : albumPanel.creating ? (
        <AlbumEditModal
          mode="create"
          photos={[]}
          fallbackAlbums={myAlbums}
          ownerId={me.id}
          busy={albumPanel.busy}
          onClose={closeModal}
          onCreate={(input) => albumPanel.create(input)}
        />
      ) : null}

      {/* 全局 confirm 弹层（盖在所有 modal 之上） */}
      <ConfirmModal
        open={!!confirmReq}
        title={confirmReq?.title ?? ""}
        body={confirmReq?.body ?? ""}
        danger={confirmReq?.danger}
        confirmLabel={confirmReq?.confirmLabel}
        cancelLabel={confirmReq?.cancelLabel}
        busy={albumPanel.busy}
        onConfirm={() => {
          confirmReq?.resolve(true);
          setConfirmReq(null);
        }}
        onCancel={() => {
          confirmReq?.resolve(false);
          setConfirmReq(null);
        }}
      />
    </>
  );
}
