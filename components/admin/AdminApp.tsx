"use client";

/**
 * AdminApp —— 后台总控（协调器）
 * ------------------------------------------------------------------
 * 单一职责：把 hooks 拼起来、把 action 编排起来、把渲染分给子组件。
 *
 * 状态分布：
 *   session / manifest / upload / cover  —— 各自 hook
 *   tab / selected / shellNotice         —— 本组件
 *
 * 对外签名不变（<AdminApp />）。app/admin/page.tsx 不需要改。
 *
 * ⚠️ 边界：本文件 import 一切运行时依赖，但**不再写业务逻辑**——
 *   - 任何 setState 必须有它的 hook / 子组件归属
 *   - 任何渲染分支必须有一一对应的 child component
 *   - 见到新的 useState 时停下来问"是不是该属于某个 hook？"
 */
import { useCallback, useState } from "react";

import CoverModal from "./modals/CoverModal";
import AdminShell from "./AdminShell";
import LoginForm from "./LoginForm";
import { Block, Frame } from "./Frame";

import { useAdminSession } from "./hooks/useAdminSession";
import { useManifest } from "./hooks/useManifest";
import { useUploadQueue } from "./hooks/useUploadQueue";
import { useCoverModal } from "./hooks/useCoverModal";

import { patchPhoto, purgePhoto, restorePhoto, trashPhoto } from "@/lib/admin-api";
import type { Manifest, Photo, PublicUser } from "@/lib/contracts";

export type AdminAppProps = {
  /** server component 在 SSR 阶段从 cookie 解析的 user。
   *  没有则 client 端探活补上。 */
  initialMe?: PublicUser | null;
};

export default function AdminApp({ initialMe = null }: AdminAppProps = {}) {
  const session = useAdminSession({ initialMe });
  const manifest = useManifest({ enabled: session.status === "authed" });
  const cover = useCoverModal();

  const [tab, setTab] = useState<"photos" | "trash" | "users" | "covers">(
    "photos",
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [shellNotice, setShellNotice] = useState<
    { kind: "ok" | "err"; text: string } | null
  >(null);

  const upload = useUploadQueue({
    me: session.me,
    save: async (m) => {
      await manifest.save(m);
    },
    onNotice: setShellNotice,
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
      for (const id of ids) await onTrashOne(id);
      await manifest.reload();
      setSelected(new Set());
      setShellNotice({ kind: "ok", text: `已移入回收站 ${ids.length} 张` });
    },
    [manifest, onTrashOne],
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

  const onPurge = useCallback(
    async (id: string) => {
      try {
        await purgePhoto(id);
      } catch (e) {
        setShellNotice({ kind: "err", text: (e as Error).message });
        return;
      }
      await manifest.reload();
      setShellNotice({ kind: "ok", text: "已彻底删除" });
    },
    [manifest],
  );

  const onCoverPick = useCallback(
    async (key: string) => {
      if (!cover.coverAlbum) return;
      await cover.saveCover(cover.coverAlbum, key);
      await manifest.reload();
    },
    [cover, manifest],
  );

  const onCoverClear = useCallback(async () => {
    if (!cover.coverAlbum) return;
    await cover.saveCover(cover.coverAlbum, null);
    await manifest.reload();
  }, [cover, manifest]);

  const onLogout = useCallback(async () => {
    await session.logout();
    setShellNotice(null);
    setSelected(new Set());
  }, [session]);

  const onToggleSelected = useCallback((id: string) => {
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }, []);

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

  const me: PublicUser = session.me!;
  const data: Manifest = manifest.data;

  return (
    <>
      <AdminShell
        me={me}
        data={data}
        tab={tab}
        notice={shellNotice}
        uploadQueue={upload.queue}
        pendingCount={upload.queue.filter((q) => q.status !== "done").length}
        selectedCount={selected.size}
        selectedIds={selected}
        onTab={setTab}
        onAddFiles={upload.addFiles}
        onRetryUpload={upload.retry}
        onLogout={onLogout}
        onTrashSelected={() => onTrashMany([...selected])}
        onEditPhoto={onEditPhoto}
        onRestore={onRestore}
        onPurge={onPurge}
        onToggleSelected={onToggleSelected}
        onOpenCover={cover.openCover}
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
    </>
  );
}
