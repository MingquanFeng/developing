/**
 * useManifest —— 后台相册清单（data + reload + save）
 * ------------------------------------------------------------------
 * 包装：
 *   - data: 当前 Manifest（EMPTY 起步）
 *   - reload(): 重新拉一次（处理 401/409 时 AdminApp 给提示）
 *   - save(partial): 合并 + 走 SDK updateManifest（自带乐观锁重试 3 次）
 *
 * 关注分离：本 hook **不**碰用户/权限/tab/UI；只管"我现在看到的清单"。
 * 其上层（PhotosTab / TrashTab / CoversTab）按需 reload()、save()。
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { EMPTY, fetchManifest } from "@/lib/album-client";
import { updateManifest } from "@/lib/admin-api";
import type { Album, Manifest, Photo } from "@/lib/contracts";

export type UseManifestOptions = {
  /** 首次数据拉取条件 —— 通常是登录成功后。 */
  enabled: boolean;
  /** 是否拉过一次后即可（默认 true）。 */
  reloadOnUpdate?: boolean;
};

export type UseManifestResult = {
  data: Manifest;
  /** reload 后整份清单最新值 */
  reload: () => Promise<void>;
  /**
   * 保存整份 Manifest（带乐观锁自动重试）。
   * 服务端返回的 revision / updatedAt 会并入 data。
   * 失败的 Error 已透传，调用方自取 message。
   */
  save: (
    next: Manifest | ((prev: Manifest) => Manifest),
  ) => Promise<Manifest | null>;
};

export function useManifest(opts: UseManifestOptions): UseManifestResult {
  const [data, setData] = useState<Manifest>(EMPTY);

  const reload = useCallback(async () => {
    try {
      const fresh = await fetchManifest();
      setData(fresh);
    } catch {
      /* 错误由调用方根据场景 toast */
    }
  }, []);

  useEffect(() => {
    if (opts.enabled) reload();
  }, [opts.enabled, reload]);

  const save = useCallback(
    async (
      nextOrUpdater: Manifest | ((prev: Manifest) => Manifest),
    ): Promise<Manifest | null> => {
      const next =
        typeof nextOrUpdater === "function"
          ? nextOrUpdater(data)
          : nextOrUpdater;
      // SDK 内部已含乐观锁重试（最多 3 次，409 自动拉最新 + bump revision 再覆盖）
      const saved = await updateManifest({
        revision: next.revision,
        albums: next.albums,
        photos: next.photos,
      });
      const merged = { ...next, ...saved };
      setData(merged);
      return merged;
    },
    [data],
  );

  return { data, reload, save };
}

/**
 * 工具：批量构造新 photo 元数据（上传完成时调用）。
 * 保持与旧 AdminApp 行为一致：
 *   - ownerId 来自会话
 *   - albumId 只挑当前用户的第一个 album（自己 album 隔离策略）
 *   - isPublic 默认 false；trashedAt = null；id 用时间戳避免冲突
 */
export function buildNewPhotos(args: {
  uploaded: ReadonlyArray<{ key: string; title: string; width: number; height: number; bytes: number }>;
  ownerId: string;
  myAlbums: readonly Album[];
  startingAlbumId: string;
}): Photo[] {
  return args.uploaded.map((u, i) => ({
    id: `ph_${Date.now().toString(36)}${i}`,
    key: u.key,
    albumId: args.startingAlbumId,
    ownerId: args.ownerId,
    isPublic: false,
    title: u.title,
    caption: "",
    place: "",
    shotAt: new Date().toISOString().slice(0, 10),
    width: u.width,
    height: u.height,
    bytes: u.bytes,
    trashedAt: null,
  }));
}

/** 没有自己 album 时给新用户/无 album 用户构造的占位 album */
export function defaultAlbum(ownerId?: string): Album {
  return {
    id: `alb_${ownerId ?? "anon"}_default`,
    slug: "default",
    name: "默认相册",
    desc: "",
    coverKey: null,
    order: 0,
    ownerId,
  };
}
