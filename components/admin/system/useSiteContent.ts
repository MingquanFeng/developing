"use client";

/**
 * useSiteContent —— 后台首页内容 hook
 * ------------------------------------------------------------------
 * 包装：
 *   - data:  当前 SiteContent（4 个 section 的合并对象）
 *   - meta:  各 key 的更新时间 + updatedBy
 *   - save<K>(key, content):  PUT  /api/site/content/[key]
 *   - reset(key):             DELETE /api/site/content/[key]
 *   - reload(): 重新拉一次
 *
 * 关注分离：本 hook 不碰 tab/UI/toast；调用方传 setShellNotice 接反馈。
 * 错误（网络 / 401 / 403 / 400 形状校验失败）原样抛出，由调用方接管。
 */
import { useCallback, useEffect, useState } from "react";
import {
  fetchSiteContent,
  fetchSiteContentMeta,
  resetSiteSection as sdkReset,
  saveSiteSection as sdkSave,
  type SiteContentDraft,
} from "@/lib/admin-api/site-content";
import type {
  SiteContentMeta,
  SiteSectionKey,
} from "@/lib/contracts";

export type UseSiteContentOptions = {
  /** 首次拉取条件 —— 通常是登录成功后。
   * 拉两个端点：
   *   - /api/site/content（公开）拿 sections：登录即可
   *   - /api/site/content/meta（admin）拿 meta：仅 admin */
  enabled: boolean;
  /** 是否是 admin（决定要不要拉 meta） */
  isAdmin: boolean;
};

export type UseSiteContentResult = {
  data: SiteContentDraft;
  meta: SiteContentMeta[];
  reload: () => Promise<void>;
  save: <K extends SiteSectionKey>(
    key: K,
    content: unknown,
  ) => Promise<{ updatedAt: string }>;
  reset: (key: SiteSectionKey) => Promise<void>;
  loading: boolean;
  busy: SiteSectionKey | null;
  loadErr: string | null;
};

const EMPTY: SiteContentDraft = {
  hero: {},
  about: {},
  subscribe: {},
  footer: {},
  story: {},
  nav: [],
};

export function useSiteContent(
  opts: UseSiteContentOptions,
): UseSiteContentResult {
  const [data, setData] = useState<SiteContentDraft>(EMPTY);
  const [meta, setMeta] = useState<SiteContentMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<SiteSectionKey | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

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

  useEffect(() => {
    if (opts.enabled) void reload();
  }, [opts.enabled, reload]);

  const save = useCallback(
    async <K extends SiteSectionKey>(key: K, content: unknown) => {
      setBusy(key);
      try {
        const r = await sdkSave(key, content as never);
        /* 乐观更新本地 data，避免 reload() 一次往返 */
        setData((prev) => ({ ...prev, [key]: content }) as SiteContentDraft);
        setMeta((prev) => {
          const without = prev.filter((m) => m.key !== key);
          return [
            ...without,
            { key, updatedAt: r.updatedAt, updatedBy: null },
          ];
        });
        return r;
      } finally {
        setBusy(null);
      }
    },
    [],
  );

  const reset = useCallback(async (key: SiteSectionKey) => {
    setBusy(key);
    try {
      await sdkReset(key);
      /* meta 里移除该 key；data 暂不清（下次 reload 会拉最新静态值） */
      setMeta((prev) => prev.filter((m) => m.key !== key));
    } finally {
      setBusy(null);
    }
  }, []);

  return { data, meta, reload, save, reset, loading, busy, loadErr };
}