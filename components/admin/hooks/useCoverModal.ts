/**
 * useCoverModal —— 封面弹层状态机
 * ------------------------------------------------------------------
 * 为什么不合并进 useManifest：coverAlbum / coverBusy / coverMsg 跟
 * 弹层绑定而非数据层；saveCover 只用 manifest 的当前快照，是写操作。
 *
 * 状态：
 *   coverAlbum: 当前要改封面的 album（null = 弹层关闭）
 *   coverBusy : 保存中
 *   coverMsg  : 成功/失败提示
 *
 *   saveCover(photoKey | null)  —— 持久化；save 后 reload 由调用方决定
 */
"use client";

import { useCallback, useState } from "react";
import { fetchManifest } from "@/lib/album-client";
import { updateManifest } from "@/lib/admin-api";
import type { Album } from "@/lib/contracts";

export type Notice = { kind: "ok" | "err"; text: string };

export type UseCoverModalResult = {
  coverAlbum: Album | null;
  coverBusy: boolean;
  coverMsg: Notice | null;
  openCover: (a: Album) => void;
  closeCover: () => void;
  saveCover: (album: Album, photoKey: string | null) => Promise<void>;
};

export function useCoverModal(): UseCoverModalResult {
  const [coverAlbum, setCoverAlbum] = useState<Album | null>(null);
  const [coverBusy, setCoverBusy] = useState(false);
  const [coverMsg, setCoverMsg] = useState<Notice | null>(null);

  const openCover = useCallback((a: Album) => setCoverAlbum(a), []);
  const closeCover = useCallback(() => {
    setCoverAlbum(null);
    setCoverMsg(null);
  }, []);

  const saveCover = useCallback(
    async (album: Album, photoKey: string | null) => {
      setCoverMsg(null);
      setCoverBusy(true);
      try {
        const cur = await fetchManifest();
        // updateManifest 自带乐观锁重试（最多 3 次）
        await updateManifest({
          revision: cur.revision,
          albums: cur.albums.map((a) =>
            a.id === album.id ? { ...a, coverKey: photoKey } : a,
          ),
          photos: cur.photos,
        });
        setCoverMsg({
          kind: "ok",
          text: photoKey
            ? `已设置 ${album.name} 的封面`
            : `已清空 ${album.name} 的封面`,
        });
        setCoverAlbum(null);
      } catch (e) {
        setCoverMsg({ kind: "err", text: (e as Error).message });
      } finally {
        setCoverBusy(false);
      }
    },
    [],
  );

  return {
    coverAlbum,
    coverBusy,
    coverMsg,
    openCover,
    closeCover,
    saveCover,
  };
}
