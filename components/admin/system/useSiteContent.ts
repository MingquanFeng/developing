"use client";

/**
 * useSiteContent —— 后台首页内容 hook
 * ------------------------------------------------------------------
 * 包装：
 *   - data:  当前 SiteContent（12 个 section 的合并对象）
 *   - meta:  各 key 的更新时间 + updatedBy
 *   - versions: 版本流（每块内容的历史快照，追加写）
 *   - save<K>(key, content, basedOnId?): PUT  /api/site/content/[key]
 *   - reset(key):                       DELETE /api/site/content/[key]
 *   - restore(version):                 用历史版本的内容原样再发一版
 *   - reload(): 重新拉一次
 *
 * 版本流的关键约定：任何一次写操作（保存 / 重置 / 恢复）都会在服务端追加
 * 一条新版本，旧版本永远留着 —— 所以本 hook 在写成功之后**必须**重拉一次
 * versions，否则列表里看不到刚发的那一版。
 *
 * 关注分离：本 hook 不碰 tab/UI/toast；调用方传 setShellNotice 接反馈。
 * 错误（网络 / 401 / 403 / 400 形状校验失败）原样抛出，由调用方接管。
 */
import { useCallback, useEffect, useState } from "react";
import {
  fetchSiteContent,
  fetchSiteContentMeta,
  fetchSiteContentVersions,
  resetSiteSection as sdkReset,
  saveSiteSection as sdkSave,
  type SiteContentDraft,
} from "@/lib/admin-api/site-content";
import type {
  SiteContentMeta,
  SiteContentVersion,
  SiteSectionKey,
} from "@/lib/contracts";

export type UseSiteContentOptions = {
  /** 首次拉取条件 —— 通常是登录成功后。
   * 拉两个端点：
   *   - /api/site/content（公开）拿 sections：登录即可
   *   - /api/site/content/meta（admin）拿 meta：仅 admin */
  enabled: boolean;
  /** 是否是 admin（决定要不要拉 meta / 版本流） */
  isAdmin: boolean;
};

export type UseSiteContentResult = {
  data: SiteContentDraft;
  meta: SiteContentMeta[];
  /** 版本流（全部 key 的版本，调用方自己按 key 过滤） */
  versions: SiteContentVersion[];
  reload: () => Promise<void>;
  /** 拉版本历史。
   *  - 不传 key：整表替换
   *  - 传 key：只替换该 key 的那几条（其余保留）
   *  失败不抛 —— 版本流只是附加信息，挂了不该连累内容编辑。 */
  loadVersions: (key?: SiteSectionKey) => Promise<void>;
  save: <K extends SiteSectionKey>(
    key: K,
    content: unknown,
    basedOnId?: number | null,
  ) => Promise<{ updatedAt: string; versionId: number }>;
  reset: (key: SiteSectionKey) => Promise<{ versionId: number }>;
  /** 把某个历史版本的内容原样发布为当前生效版本 */
  restore: (version: SiteContentVersion) => Promise<{ versionId: number }>;
  loading: boolean;
  busy: SiteSectionKey | null;
  loadErr: string | null;
  versionsLoading: boolean;
  versionsErr: string | null;
};

const EMPTY: SiteContentDraft = {
  hero: {},
  about: {},
  subscribe: {},
  footer: {},
  story: {},
  nav: [],
  interlude01: {},
  interlude03: {},
  coords: {},
  worksIntro: {},
  site: {},
  series: [],
};

export function useSiteContent(
  opts: UseSiteContentOptions,
): UseSiteContentResult {
  const [data, setData] = useState<SiteContentDraft>(EMPTY);
  const [meta, setMeta] = useState<SiteContentMeta[]>([]);
  const [versions, setVersions] = useState<SiteContentVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<SiteSectionKey | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [versionsErr, setVersionsErr] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadErr(null);
    try {
      /* sections 公开拉；meta 仅 admin 拉（meta 失败不阻塞 sections） */
      const sec = await fetchSiteContent();
      setData(sec.sections);
      if (opts.isAdmin) {
        try {
          const m = await fetchSiteContentMeta();
          setMeta(m.meta);
        } catch {
          /* meta 失败不报错：viewer 走非 admin 路径直接 ignore */
        }
      } else {
        setMeta([]);
      }
    } catch (e) {
      setLoadErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [opts.isAdmin]);

  const loadVersions = useCallback(async (key?: SiteSectionKey) => {
    setVersionsLoading(true);
    setVersionsErr(null);
    try {
      const r = await fetchSiteContentVersions(key);
      setVersions((prev) =>
        key
          ? [...prev.filter((v) => v.key !== key), ...r.versions]
          : r.versions,
      );
    } catch (e) {
      /* 版本流挂了不影响内容编辑 —— 只记错，让 UI 给空态 + 重试 */
      setVersionsErr((e as Error).message);
    } finally {
      setVersionsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (opts.enabled) void reload();
  }, [opts.enabled, reload]);

  /* 版本流是 admin-only 端点 —— 非 admin 拉了只会拿到 403 */
  useEffect(() => {
    if (opts.enabled && opts.isAdmin) void loadVersions();
  }, [opts.enabled, opts.isAdmin, loadVersions]);

  const save = useCallback(
    async <K extends SiteSectionKey>(
      key: K,
      content: unknown,
      basedOnId?: number | null,
    ) => {
      setBusy(key);
      try {
        const r = await sdkSave(key, content as never, basedOnId ?? null);
        /* 乐观更新本地 data，避免 reload() 一次往返 */
        setData((prev) => ({ ...prev, [key]: content }) as SiteContentDraft);
        setMeta((prev) => {
          const without = prev.filter((m) => m.key !== key);
          return [
            ...without,
            { key, updatedAt: r.updatedAt, updatedBy: null },
          ];
        });
        /* 新版本必须立刻出现在历史里 —— 重新拉一次版本流 */
        await loadVersions();
        return r;
      } finally {
        setBusy(null);
      }
    },
    [loadVersions],
  );

  const reset = useCallback(
    async (key: SiteSectionKey) => {
      setBusy(key);
      try {
        const r = await sdkReset(key);
        /* meta 里移除该 key；data 暂不清（下次 reload 会拉最新静态值） */
        setMeta((prev) => prev.filter((m) => m.key !== key));
        /* 重置也会追加一条「重置」版本 —— 同样要刷新列表 */
        await loadVersions();
        return r;
      } finally {
        setBusy(null);
      }
    },
    [loadVersions],
  );

  const restore = useCallback(
    async (version: SiteContentVersion) => {
      setBusy(version.key);
      try {
        /* 恢复 = 用历史版本的 content 再发一版；basedOnId 指回它自己，
           服务端据此把版本链串起来（旧版本不会被覆盖）。 */
        const r = await sdkSave(
          version.key,
          version.content as never,
          version.id,
        );
        setData(
          (prev) =>
            ({ ...prev, [version.key]: version.content }) as SiteContentDraft,
        );
        await loadVersions();
        return r;
      } finally {
        setBusy(null);
      }
    },
    [loadVersions],
  );

  return {
    data,
    meta,
    versions,
    reload,
    loadVersions,
    save,
    reset,
    restore,
    loading,
    busy,
    loadErr,
    versionsLoading,
    versionsErr,
  };
}
