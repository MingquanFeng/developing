"use client";

/**
 * SystemTab —— "系统设置" tab 的内容组合器
 * ------------------------------------------------------------------
 * 两大块：
 *   1. CoversPanel —— 5 个 series 封面（沿用旧功能，从 AdminShell 拆出）
 *   2. HomeContentPanel —— 首期 4 个 section 的后台编辑
 *
 * 不持有业务 state —— 一切来自 props（useSiteContent / useManifest）。
 */
import type { Album, Manifest } from "@/lib/contracts";
import type { SiteSectionKey } from "@/lib/contracts";
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
  onSaveSection: (key: SiteSectionKey, content: unknown) => Promise<void>;
  onResetSection: (key: SiteSectionKey) => Promise<void>;

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
  onSaveSection,
  onResetSection,
  onRequestConfirm,
}: SystemTabProps) {
  return (
    <section className={styles.section} aria-label="系统设置">
      <header className={styles.pageHeader}>
        <h2 className={styles.pageTitle}>系统设置</h2>
        <span className={styles.pageSub}>
          封面管理 + 首页内容编辑
        </span>
      </header>

      <CoversPanel data={data} onOpenCover={onOpenCover} />

      <HomeContentPanel
        data={siteContent}
        busy={busy}
        onSave={onSaveSection}
        onReset={onResetSection}
        onRequestConfirm={onRequestConfirm}
      />
    </section>
  );
}