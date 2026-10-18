/**
 * useAlbumsPanel —— 后台相册 CRUD 状态机
 * ------------------------------------------------------------------
 * 拆出来的状态：
 *   editing: Album | null   — 当前编辑中的相册（弹层显示）
 *   creating: boolean        — 是否显示新建弹层
 *   busy: boolean            — 写操作进行中（按钮置灰 / 防止重复提交）
 *   msg: Notice | null       — 成功/失败反馈
 *
 * 操作：
 *   openCreate()                       打开新建弹层
 *   openEdit(album)                    打开编辑弹层
 *   close()                            关弹层 + 清 msg
 *   create(input)                      新建相册（id 走 lib/album-id.newAlbumId 去重）
 *   patch(id, partial)                 改已有相册
 *   deleteAlbum(id)                    删相册；非回收站照片先迁到 fallback
 *   setCover(album, photoKey | null)   改 coverKey（与 CoverModal 行为一致）
 *
 * 写走 manifest.save(next => ...)，**不**新开 REST 端点 —— 跟 useCoverModal
 * 共用乐观锁重试 3 次。失败统一翻译成 notice，setShellNotice 同步外层 header。
 *
 * 设计点：
 *   - 不依赖 React Context；上层（AdminApp）传 props 进来。
 *   - 不在 hook 里做 scope 过滤 —— 那个属于 AdminShell 的事情。
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchManifest } from "@/lib/album-client";
import {
  fallbackAlbum,
  newAlbumId,
  slugify,
} from "@/lib/album-id";
import type { Album, Manifest, PublicUser } from "@/lib/contracts";

export type Notice = { kind: "ok" | "err"; text: string };

/** 新建相册的输入（slug 不传就自动从 name 推） */
export type NewAlbumInput = {
  name: string;
  slug?: string;
  desc?: string;
  /** 初始化可选封面 */
  coverKey?: string | null;
};

export type UseAlbumsPanelOptions = {
  me: PublicUser;
  /** 写完整份 Manifest；下一层（useManifest.save）自带乐观锁重试。
   *  这里直接拿 reference 用 —— 不依赖远端保存后本地状态必然最新。 */
  save: (next: Manifest | ((prev: Manifest) => Manifest)) => Promise<Manifest | null>;
  /** 同步外层 AdminApp 的 shellNotice（顶部条） */
  setShellNotice: (n: Notice | null) => void;
};

export type UseAlbumsPanelResult = {
  editing: Album | null;
  creating: boolean;
  busy: boolean;
  msg: Notice | null;

  openCreate: () => void;
  openEdit: (a: Album) => void;
  close: () => void;

  create: (input: NewAlbumInput) => Promise<void>;
  patch: (id: string, partial: Partial<Album>) => Promise<void>;
  deleteAlbum: (id: string) => Promise<void>;
  setCover: (album: Album, photoKey: string | null) => Promise<void>;
};

export function useAlbumsPanel(
  opts: UseAlbumsPanelOptions,
): UseAlbumsPanelResult {
  const { me, save, setShellNotice } = opts;

  const [editing, setEditing] = useState<Album | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Notice | null>(null);

  /* me 变化（切换账号 / logout 后再 login）时重置 panel 状态 —— 否则上次的
     msg/editing/creating 会跨账户残留（用户反馈"提示在所有账户都能看到"） */
  useEffect(() => {
    setMsg(null);
    setEditing(null);
    setCreating(false);
    setBusy(false);
  }, [me?.id]);

  const setBothNotices = useCallback(
    (n: Notice | null) => {
      setMsg(n);
      /* 不再 setShellNotice(n) —— AlbumsTab 内部 msg 已经显示，
         否则顶部 header 也会渲染同一文本（用户反馈"提示了两次"）。
         顶部 header 留给 useUploadQueue 等其他模块的错误反馈。 */
    },
    [],
  );

  const openCreate = useCallback(() => {
    setMsg(null);
    setEditing(null);
    setCreating(true);
  }, []);

  const openEdit = useCallback((a: Album) => {
    setMsg(null);
    setCreating(false);
    setEditing(a);
  }, []);

  const close = useCallback(() => {
    setEditing(null);
    setCreating(false);
    setMsg(null);
  }, []);

  /** 用 fetchManifest 拿最新快照，再走 manifest.save 完成单次乐观锁写 */
  const withSnapshot = useCallback(
    async (
      mutate: (cur: Manifest) => Manifest,
      successMsg: string,
    ): Promise<void> => {
      setBothNotices(null);
      setBusy(true);
      try {
        const cur = await fetchManifest();
        const next = mutate(cur);
        await save(next);
        setBothNotices({ kind: "ok", text: successMsg });
      } catch (e) {
        setBothNotices({
          kind: "err",
          text: (e as Error).message || "操作失败",
        });
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [save, setBothNotices],
  );

  const create = useCallback(
    async (input: NewAlbumInput) => {
      const name = (input.name ?? "").trim();
      if (!name) {
        setBothNotices({ kind: "err", text: "请填写相册名" });
        return;
      }
      const ownerId = me.id;
      const newAlbum: Album = await fetchManifest().then((cur) => {
        const taken = new Set(cur.albums.map((a) => a.id));
        const slug = slugify(input.slug ?? name);
        const id = newAlbumId(ownerId, slug, taken);
        return {
          id,
          slug,
          name,
          desc: input.desc ?? "",
          coverKey: input.coverKey ?? null,
          // 排在 fallback (order=999) 之下；其余相册继续追加
          order: cur.albums.length + 1,
          ownerId,
        };
      });
      await withSnapshot(
        (cur) => ({
          ...cur,
          albums: [...cur.albums, newAlbum],
        }),
        `已创建相册「${name}」`,
      );
      // 关闭弹层
      setCreating(false);
    },
    [me.id, setBothNotices, withSnapshot],
  );

  const patch = useCallback(
    async (id: string, partial: Partial<Album>) => {
      await withSnapshot(
        (cur) => ({
          ...cur,
          albums: cur.albums.map((a) =>
            a.id === id ? { ...a, ...partial } : a,
          ),
        }),
        "已保存",
      );
      // 同步更新 editing 视图（避免弹层里仍显示旧值）
      setEditing((cur) => (cur && cur.id === id ? { ...cur, ...partial } : cur));
    },
    [withSnapshot],
  );

  /**
   * 删相册：服务端语义（前端的 mirror）
   *   1. owner 的 fallback 相册若不存在，先创建一个
   *   2. 非回收站照片 albumId → fallback.id
   *   3. 该相册从 albums 列表移除
   *   4. 若 fallback 是新建的，append 到末尾；order=999 保持
   * 回收站照片不动 —— 用户已主动删除的不归本相册
   */
  const deleteAlbum = useCallback(
    async (id: string) => {
      await withSnapshot((cur) => {
        // scope：只动 owner 自己相册里挂着的那张（ownerId === me.id）的照片
        const ownerId = me.id;
        const target = cur.albums.find((a) => a.id === id);
        if (!target) return cur;

        // 找同 owner 的 fallback（id 以 `_fallback_` 结尾就足够——见 lib/album-id.ts）
        let fallback = cur.albums.find(
          (a) => a.ownerId === ownerId && a.slug === "fallback",
        );
        const albumsNext: Album[] = [...cur.albums];
        if (!fallback) {
          // 用 lib/album-id 工具构造（与兜底顺序一致）
          const made = fallbackAlbum(ownerId, cur.albums);
          albumsNext.push(made);
          fallback = made;
        }

        const movedPhotos = cur.photos.map((p) => {
          if (p.albumId !== id) return p;
          if (p.trashedAt) return p; // 回收站不动
          // 安全：只迁移 owner === me 自己相册里的；别人的相册不归本用户管
          if (p.ownerId !== ownerId) return p;
          return { ...p, albumId: fallback!.id };
        });

        return {
          ...cur,
          albums: albumsNext.filter((a) => a.id !== id),
          photos: movedPhotos,
        };
      }, "已删除相册，照片已转入回收相册");
      setEditing((cur) => (cur && cur.id === id ? null : cur));
    },
    [me.id, withSnapshot],
  );

  /** 改 coverKey：与 useCoverModal 行为对齐，存时走 fetchManifest 拍快照 */
  const setCover = useCallback(
    async (album: Album, photoKey: string | null) => {
      await withSnapshot(
        (cur) => ({
          ...cur,
          albums: cur.albums.map((a) =>
            a.id === album.id ? { ...a, coverKey: photoKey } : a,
          ),
        }),
        photoKey
          ? `已设置「${album.name}」的封面`
          : `已清空「${album.name}」的封面`,
      );
      setEditing((cur) =>
        cur && cur.id === album.id ? { ...cur, coverKey: photoKey } : cur,
      );
      // 这里不关 editing —— caller 决定是否需要保留弹层显示
    },
    [withSnapshot],
  );

  return {
    editing,
    creating,
    busy,
    msg,
    openCreate,
    openEdit,
    close,
    create,
    patch,
    deleteAlbum,
    setCover,
  };
}
