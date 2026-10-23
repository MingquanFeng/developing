"use client";

/**
 * SystemTab —— 「站点内容」tab 的内容组合器
 * ------------------------------------------------------------------
 * 两大块：
 *   1. CoversPanel —— 5 个 series 封面（沿用旧功能，从 AdminShell 拆出）
 *   2. HomeContentPanel —— 12 个 section 的「内容版本管理」
 *      （左栏选块 / 右栏看历史版本 + 编辑）
 *
 * ⚠️ 这一块以前叫「系统设置」—— 名不副实：它管的是**公开站点的内容**
 *    （首页九幕文案 + 封面 + 站点 meta），不是配置开关。
 *    「站点内容」才说得清它是什么。tab 的 key 仍叫 system（内部标识，
 *    改它要动 AdminTab 联合类型 + AdminApp 的分支，没必要）。
 *
 * 不持有业务 state —— 一切来自 props（useSiteContent / useManifest）。
 */
import type { Album, Manifest } from "@/lib/contracts";
import type { SiteSectionKey, SiteContentVersion } from "@/lib/contracts";
import type { SiteContentDraft } from "@/lib/admin-api/site-content";
import CoversPanel from "./CoversPanel";
import HomeContentPanel from "./HomeContentPanel";
import styles from "../admin.module.css";

export type SystemTabProps = {
  /* CoversPanel */
  data: Manifest;
  onOpenCover: (a: Album) => void;

  /* HomeContentPanel */
  siteContent: SiteContentDraft;
  busy: SiteSectionKey | null;
  /** 版本流（全部 key） */
  siteContentVersions: SiteContentVersion[];
  siteContentVersionsLoading: boolean;
  siteContentVersionsErr: string | null;
  onSaveSection: (
    key: SiteSectionKey,
    content: unknown,
    basedOnId?: number | null,
  ) => Promise<{ versionId: number }>;
  onResetSection: (key: SiteSectionKey) => Promise<{ versionId: number }>;
  /** 恢复历史版本 —— 把它原样发布为当前生效版本 */
  onRestoreSection: (
    version: SiteContentVersion,
  ) => Promise<{ versionId: number }>;
  /** 版本历史拉失败时的重试 */
  onReloadVersions: () => void;

  onRequestConfirm: (opts: {
    title: string;
    body: string;
    danger?: boolean;
    confirmLabel?: string;
    cancelLabel?: string;
  }) => Promise<boolean>;
};

export default function SystemTab({
  data,
  onOpenCover,
  siteContent,
  busy,
  siteContentVersions,
  siteContentVersionsLoading,
  siteContentVersionsErr,
  onSaveSection,
  onResetSection,
  onRestoreSection,
  onReloadVersions,
  onRequestConfirm,
}: SystemTabProps) {
  return (
    <section className={styles.section} aria-label="站点内容">
      <header className={styles.pageHeader}>
        <h2 className={styles.pageTitle}>站点内容</h2>
        <span className={styles.pageSub}>
          封面管理 + 内容版本管理
        </span>
      </header>

      <CoversPanel data={data} onOpenCover={onOpenCover} />

      <HomeContentPanel
        data={siteContent}
        busy={busy}
        versions={siteContentVersions}
        versionsLoading={siteContentVersionsLoading}
        versionsErr={siteContentVersionsErr}
        onSave={onSaveSection}
        onReset={onResetSection}
        onRestore={onRestoreSection}
        onReloadVersions={onReloadVersions}
        onRequestConfirm={onRequestConfirm}
      />
    </section>
  );
}
