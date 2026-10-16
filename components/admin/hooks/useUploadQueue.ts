/**
 * useUploadQueue —— 上传队列（拖拽 → 预检 → 签名 → 直传 → 入库）
 * ------------------------------------------------------------------
 * 包装三件事：
 *   - queue: 队列状态（progress / status 由 upload-queue.ts 管）
 *   - addFiles(files): 用户拖拽或选择的入口
 *   - runUpload 完成后，把元数据落库 + 通知 UI
 *
 * 依赖注入：上层把 ownerId / manifest / save 传进来；本 hook 不直接
 * 拿 AdminApp 任何东西。便于单测（PR-6 会加）。
 *
 * 出错一律走回调 onNotice —— 上层决定 toast 在哪里。
 */
"use client";

import { useCallback, useState } from "react";
import { fetchManifest } from "@/lib/album-client";
import {
  inspectFile,
  newItem,
  runUpload,
  type QueueItem,
} from "../upload-queue";
import { buildNewPhotos, defaultAlbum } from "./useManifest";
import type { Manifest, PublicUser } from "@/lib/contracts";

export type Notice = { kind: "ok" | "err"; text: string };

export type UseUploadQueueOptions = {
  me: PublicUser | null;
  /** 上传成功后，把元数据并入 manifest 并写回。 */
  save: (next: Manifest) => Promise<unknown>;
  onNotice: (n: Notice) => void;
};

export type UseUploadQueueResult = {
  queue: QueueItem[];
  addFiles: (files: File[]) => Promise<void>;
  /** 重新触发单个失败项 */
  retry: (item: QueueItem) => Promise<void>;
  /** 完成项清掉（用于库内调用） */
  clearDone: () => void;
};

export function useUploadQueue(
  opts: UseUploadQueueOptions,
): UseUploadQueueResult {
  const { me, save, onNotice } = opts;
  const [queue, setQueue] = useState<QueueItem[]>([]);

  const addFiles = useCallback(
    async (files: File[]) => {
      const accepted: QueueItem[] = [];
      const rejected: string[] = [];

      for (const f of files) {
        const r = await inspectFile(f);
        if (r.ok) accepted.push(newItem(f, r.width, r.height));
        else rejected.push(`${f.name}：${r.reason}`);
      }

      if (rejected.length) {
        onNotice({ kind: "err", text: rejected.join("；") });
      }
      if (!accepted.length) return;

      setQueue((q) => [...q, ...accepted]);
      onNotice({ kind: "ok", text: `开始上传 ${accepted.length} 张…` });

      const snapshot = [...queue, ...accepted];
      await runUpload(snapshot, {
        onChange: setQueue,
        onComplete: async (uploaded) => {
          if (!uploaded.length) {
            onNotice({ kind: "err", text: "没有成功的文件" });
            return;
          }
          try {
            const cur = await fetchManifest();
            // 相册按用户隔离：只能挑自己名下的，绝不能拿 cur.albums[0]
            // （那可能是别人的相册，照片会被写进去但 ownerId 对不上）
            const myAlbums = cur.albums.filter((a) => a.ownerId === me?.id);
            /* viewer 没自己 album 时，**先建一个 defaultAlbum** 再写照片；
               albumId 用 defaultAlbum.id 而不是空串 —— 否则服务端
               album_not_found 校验会把整批 PUT 拒掉（之前修过的那个 bug）。 */
            const willAddDefault = myAlbums.length === 0;
            const targetAlbum = willAddDefault
              ? defaultAlbum(me?.id)
              : myAlbums[0];
            const albumId = targetAlbum.id;
            const albums = willAddDefault
              ? [...cur.albums, targetAlbum]
              : cur.albums;
            const photos = buildNewPhotos({
              uploaded,
              ownerId: me?.id ?? "",
              myAlbums,
              startingAlbumId: albumId,
            });
            await save({
              ...cur,
              albums,
              photos: [...cur.photos, ...photos],
            });
            onNotice({ kind: "ok", text: `已入库 ${photos.length} 张` });
          } catch (e) {
            onNotice({
              kind: "err",
              text: `文件已传上去但写元数据失败：${(e as Error).message}。刷新后可在列表里手动补录。`,
            });
          }
          setQueue((q) => q.filter((it) => it.status !== "done"));
        },
        onError: (m) => onNotice({ kind: "err", text: m }),
      });
    },
    [queue, me, save, onNotice],
  );

  const retry = useCallback(
    async (item: QueueItem) => {
      await addFiles([item.file]);
    },
    [addFiles],
  );

  const clearDone = useCallback(() => {
    setQueue((q) => q.filter((it) => it.status !== "done"));
  }, []);

  return { queue, addFiles, retry, clearDone };
}
