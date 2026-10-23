"use client";

/**
 * HomeContentPanel —— 「站点内容」页的「内容版本管理」节
 * ------------------------------------------------------------------
 * 主从布局（master / detail）：
 *
 *   左栏  12 个内容块。每行显示块名、一句说明、当前版本的更新时间、
 *         版本条数徽章。点击切换右栏显示的块。
 *   右栏  选中块的详情：
 *           - 版本列表（该块历史上发布过的每一版）
 *           - 「编辑内容」按钮 → 弹框里打开编辑器（不内联）
 *
 * 版本流的交互约定：
 *   - 「编辑」：把该版本的 content 作为草稿喂给编辑器；保存即**以该版本
 *     为基础发布一个新版本**（basedOnId = 该版本 id），旧版本留在历史里。
 *   - 「恢复」：把该版本 content 原样再发一版，成为当前生效版本。
 *   - editor 内部的 dirtyRef 会保护用户正在改的内容，所以切换块 / 切换
 *     版本时用 key 强制重挂载编辑器来重置草稿 —— 不改 editors/* 的实现。
 *
 * 编辑器为什么是弹框：12 个块的表单都很长（hero 十几行、series 五组各
 * 10 个字段），内联在右栏会把版本历史整个顶出屏幕。弹框里表单自己滚，
 * 头部（标题 + 关闭）留在视口里。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  SiteContentVersion,
  SiteSectionKey,
} from "@/lib/contracts";
import { hero as heroStatic } from "@/lib/data/home";
import { about as aboutStatic } from "@/lib/data/about";
import { subscribe as subscribeStatic } from "@/lib/data/subscribe";
import { footer as footerStatic } from "@/lib/data/footer";
import { story as storyStatic } from "@/lib/data/story";
import { nav as navStatic } from "@/lib/data/nav";
import { site as siteStatic } from "@/lib/data/site";
import type { SiteContentData } from "@/lib/contracts";
import {
  interlude01 as interlude01Static,
  interlude03 as interlude03Static,
  coords as coordsStatic,
  worksIntro as worksIntroStatic,
  series as seriesStatic,
} from "@/lib/data/home";
import type { SiteContentDraft } from "@/lib/admin-api/site-content";
import { summarizeSection } from "@/lib/site-content-summary";
import { SITE_SECTIONS } from "@/lib/site-sections";
import type { Writable } from "./editors/_writable";
import ContentEditorModal from "./ContentEditorModal";
import HeroEditor from "./editors/HeroEditor";
import AboutEditor from "./editors/AboutEditor";
import SubscribeEditor from "./editors/SubscribeEditor";
import FooterEditor from "./editors/FooterEditor";
import StoryEditor from "./editors/StoryEditor";
import NavEditor from "./editors/NavEditor";
import InterludeEditor from "./editors/InterludeEditor";
import CoordsEditor from "./editors/CoordsEditor";
import WorksIntroEditor from "./editors/WorksIntroEditor";
import SiteEditor from "./editors/SiteEditor";
import SeriesEditor from "./editors/SeriesEditor";
import styles from "../admin.module.css";
import editorStyles from "./editors/editors.module.css";
import vStyles from "./version-list.module.css";

export type HomeContentPanelProps = {
  data: SiteContentDraft;
  busy: SiteSectionKey | null;
  /** 版本流（全部 key） */
  versions: SiteContentVersion[];
  versionsLoading: boolean;
  versionsErr: string | null;
  /** 保存 = 以 basedOnId 指定的那一版为基础发布新版本 */
  onSave: (
    key: SiteSectionKey,
    content: unknown,
    basedOnId?: number | null,
  ) => Promise<{ versionId: number }>;
  onReset: (key: SiteSectionKey) => Promise<{ versionId: number }>;
  /** 恢复：把该版本 content 原样发布为当前生效版本 */
  onRestore: (version: SiteContentVersion) => Promise<{ versionId: number }>;
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

/**
 * 12 个内容块 —— 左栏列表与右栏标题共用。
 *
 * 数据与顺序都在 lib/site-sections.ts（那里是单一事实来源，顺序 =
 * 首页自上而下）。这里只做 re-export，别处 import 本文件也能用。
 */
export const SECTIONS = SITE_SECTIONS;

/* ------------------------------------------------------------------
   摘要：把一个版本的 content 压成一句人话
   ------------------------------------------------------------------
   实现放在 lib/site-content-summary.ts（纯函数，可单测）。
   这里再导出一次，别处直接 import 本文件即可。 */
export { summarizeSection } from "@/lib/site-content-summary";

/** ISO → "YYYY-MM-DD HH:MM"，坏值 → "—" */
function formatTime(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** live 内容是不是"还没拿到"（{} / []）—— 是的话用静态默认兜底 */
function isBlankish(v: unknown): boolean {
  if (typeof v !== "object" || v === null) return true;
  if (Array.isArray(v)) return v.length === 0;
  return Object.keys(v as object).length === 0;
}

export default function HomeContentPanel({
  data,
  busy,
  versions,
  versionsLoading,
  versionsErr,
  onSave,
  onReset,
  onRestore,
  onReloadVersions,
  onRequestConfirm,
}: HomeContentPanelProps) {
  /* 当前选中的块（左栏） */
  const [activeKey, setActiveKey] = useState<SiteSectionKey>("hero");
  /* 正在编辑的那一版 —— null = 没有版本历史（用线上当前值当草稿） */
  const [draftVersionId, setDraftVersionId] = useState<number | null>(null);
  /* 编辑器重挂载计数 —— 只在"用户显式换草稿"时 +1（见 editorKey 处的注释） */
  const [editorEpoch, setEditorEpoch] = useState(0);
  /* 编辑器弹层开没开 —— 编辑器不再内联在右栏里 */
  const [editorOpen, setEditorOpen] = useState(false);
  /* 这一轮弹层里保存过没有 —— 保存过就直接关，没保存才问「要放弃修改吗」 */
  const savedRef = useRef(false);
  const [actionErr, setActionErr] = useState<string | null>(null);

  /* 防御：DB 拿到的 shape 在 setSiteSection 时已校验；这里 cast 是
     类型上让 editor 拿到精确 typeof，运行时不可能出错。
     readonly → mutable 的 cast TS 不允许一次直跳，需要 unknown 中转。 */
  const staticFallback = useMemo(
    () => ({
      hero: heroStatic as unknown as Writable<typeof heroStatic>,
      about: aboutStatic as unknown as Writable<typeof aboutStatic>,
      subscribe: subscribeStatic as unknown as Writable<typeof subscribeStatic>,
      footer: footerStatic as unknown as Writable<typeof footerStatic>,
      story: storyStatic as unknown as Writable<typeof storyStatic>,
      nav: [...navStatic] as unknown as Writable<typeof navStatic>,
      interlude01:
        interlude01Static as unknown as Writable<typeof interlude01Static>,
      interlude03:
        interlude03Static as unknown as Writable<typeof interlude03Static>,
      coords: coordsStatic as unknown as Writable<typeof coordsStatic>,
      worksIntro:
        worksIntroStatic as unknown as Writable<typeof worksIntroStatic>,
      site: {
        name: siteStatic.name,
        nameEn: siteStatic.nameEn,
        title: siteStatic.title,
        description: siteStatic.description,
        projectName: siteStatic.projectName,
        edition: siteStatic.edition,
        foundedYear: siteStatic.foundedYear,
        cities: [...siteStatic.cities],
        marquee: [...siteStatic.marquee],
      } as unknown as Writable<SiteContentData>,
      series: seriesStatic.map(
        (s) => ({ ...s }),
      ) as unknown as Writable<typeof seriesStatic>,
    }),
    [],
  );

  /* 按 key 归拢版本，新的排前面（id 自增 → 越大越新） */
  const versionsByKey = useMemo(() => {
    const m = new Map<SiteSectionKey, SiteContentVersion[]>();
    for (const v of versions) {
      const arr = m.get(v.key);
      if (arr) arr.push(v);
      else m.set(v.key, [v]);
    }
    for (const arr of m.values()) arr.sort((a, b) => b.id - a.id);
    return m;
  }, [versions]);

  const activeVersions = useMemo(
    () => versionsByKey.get(activeKey) ?? [],
    [versionsByKey, activeKey],
  );

  /* 正在编辑的那一版 —— 内容来源 + 列表高亮 + 下一次保存的 basedOnId */
  const draftVersion = useMemo(
    () => activeVersions.find((v) => v.id === draftVersionId) ?? null,
    [activeVersions, draftVersionId],
  );

  /* 取某个块的「当前生效」版本 id（切块时用） */
  const currentVersionIdOf = useCallback(
    (key: SiteSectionKey): number | null => {
      const list = versionsByKey.get(key) ?? [];
      const cur = list.find((v) => v.isCurrent) ?? list[0];
      return cur ? cur.id : null;
    },
    [versionsByKey],
  );

  /* 编辑基失效（切块 / 版本被删）时回落到「当前生效」那一版 */
  useEffect(() => {
    if (!activeVersions.length) {
      setDraftVersionId(null);
      return;
    }
    if (activeVersions.some((v) => v.id === draftVersionId)) return;
    const cur = activeVersions.find((v) => v.isCurrent) ?? activeVersions[0];
    setDraftVersionId(cur.id);
  }, [activeVersions, draftVersionId]);

  /* 编辑器草稿来源：选中了版本就用那个版本的快照，否则用线上当前值 */
  const liveContent = data[activeKey];
  const draftContent = draftVersion
    ? draftVersion.content
    : isBlankish(liveContent)
      ? staticFallback[activeKey]
      : liveContent;

  /* 编辑器 key：只在「用户显式换草稿」时换 —— 切块 / 点某个版本的「编辑」。
     ⚠️ 不能把 draftVersionId 拼进 key：保存成功后 draftVersionId 会指向
     新发布的版本，一并换 key 会重挂载编辑器，把 editor 内部的「已保存」
     提示冲掉。所以用独立的 epoch 计数，只在显式换草稿时 +1。 */
  const editorKey = `${activeKey}:${editorEpoch}`;

  const selectSection = useCallback(
    (key: SiteSectionKey) => {
      setActiveKey(key);
      /* 切块 → 草稿回到新块的「当前生效」那一版 */
      setDraftVersionId(currentVersionIdOf(key));
      setEditorEpoch((e) => e + 1);
      setActionErr(null);
    },
    [currentVersionIdOf],
  );

  const handleSave = useCallback(
    async (content: unknown) => {
      setActionErr(null);
      try {
        /* 以「当前正在编辑的那一版」为基础发布新版本 —— 没有历史时 basedOnId = null */
        const r = await onSave(activeKey, content, draftVersionId ?? null);
        /* 新版本立刻成为编辑基（它就是当前生效版）。
           刻意不重挂载编辑器：内容没变，且要保住 editor 的「已保存」提示。 */
        setDraftVersionId(r.versionId);
        /* 这一轮保存过了 —— 关弹层时不再问「要放弃修改吗」 */
        savedRef.current = true;
      } catch (e) {
        setActionErr((e as Error).message);
        throw e;
      }
    },
    [activeKey, draftVersionId, onSave],
  );

  const handleReset = useCallback(async () => {
    setActionErr(null);
    try {
      const r = await onReset(activeKey);
      setDraftVersionId(r.versionId);
      /* 重置也是一次发布（记一条「重置」版本）—— 没有未保存的改动可丢 */
      savedRef.current = true;
      /* 重置后内容变了（回到静态默认）—— 重挂载一次，
         让编辑器确定地显示默认值（不依赖 editor 内部的 dirtyRef 时序）。 */
      setEditorEpoch((e) => e + 1);
    } catch (e) {
      setActionErr((e as Error).message);
      throw e;
    }
  }, [activeKey, onReset]);

  const handleRestore = useCallback(
    async (version: SiteContentVersion) => {
      const ok = await onRequestConfirm({
        title: "恢复该历史版本",
        body: `把版本 #${version.id}（${formatTime(version.createdAt)}）的内容原样发布为当前生效版本。当前版本不会被删除，仍留在历史里。`,
        confirmLabel: "恢复并发布",
      });
      if (!ok) return;
      setActionErr(null);
      try {
        const r = await onRestore(version);
        setDraftVersionId(r.versionId);
        /* 恢复的内容可能跟编辑器里正在改的不一样 —— 重挂载，
           让编辑器直接显示恢复后的内容。 */
        setEditorEpoch((e) => e + 1);
      } catch (e) {
        setActionErr((e as Error).message);
      }
    },
    [onRequestConfirm, onRestore],
  );

  const handleEdit = useCallback((version: SiteContentVersion) => {
    setActionErr(null);
    setDraftVersionId(version.id);
    /* 显式换草稿 → 重挂载（editor 内部 dirtyRef 会挡住 data 同步，
       只有重挂载才能干净地换成这一版的内容）。 */
    setEditorEpoch((e) => e + 1);
    savedRef.current = false;
    setEditorOpen(true);
  }, []);

  /** 打开当前生效版本的编辑器（版本行之外的入口） */
  const handleEditCurrent = useCallback(() => {
    setActionErr(null);
    setDraftVersionId(currentVersionIdOf(activeKey));
    setEditorEpoch((e) => e + 1);
    savedRef.current = false;
    setEditorOpen(true);
  }, [activeKey, currentVersionIdOf]);

  /**
   * 请求关闭编辑器弹层。
   *
   * 保存过 → 直接关（没什么可丢的）；没保存过 → 二次确认
   * 「未保存的修改会丢失」—— 编辑器的草稿在它自己内部（dirtyRef），
   * 父级看不见改没改，只能保守地问。
   */
  const handleRequestCloseEditor = useCallback(async () => {
    if (savedRef.current) {
      setEditorOpen(false);
      /* 草稿基线回到「当前生效」那一版 —— 下次打开是干净的 */
      setDraftVersionId(currentVersionIdOf(activeKey));
      setEditorEpoch((e) => e + 1);
      return;
    }
    const ok = await onRequestConfirm({
      title: "关闭编辑器",
      body: "这一版还没保存过，关闭会丢掉未保存的修改。",
      confirmLabel: "关闭并放弃",
      cancelLabel: "继续编辑",
    });
    if (!ok) return;
    setEditorOpen(false);
    setDraftVersionId(currentVersionIdOf(activeKey));
    setEditorEpoch((e) => e + 1);
  }, [activeKey, currentVersionIdOf, onRequestConfirm]);

  const activeSection = SECTIONS.find((s) => s.key === activeKey);

  const editorProps = {
    data: draftContent as never,
    busy: busy === activeKey,
    onSave: (c: unknown) => handleSave(c),
    onReset: () => handleReset(),
    onRequestConfirm,
  };

  return (
    <section className={styles.section} aria-label="内容版本管理">
      <header className={styles.sectionHeader}>
        <h3 className={styles.sectionTitle}>内容版本管理</h3>
        <span className={styles.pageSub}>
          每一块内容都保留发布历史，可挑任意一版重新编辑 / 重新发布
        </span>
      </header>

      <div className={vStyles.split}>
        {/* ---------- 左栏：12 个内容块 ---------- */}
        <ul className={vStyles.side} aria-label="内容块列表">
          {SECTIONS.map(({ key, label, hint }) => {
            const list = versionsByKey.get(key) ?? [];
            const cur = list.find((v) => v.isCurrent) ?? null;
            const on = key === activeKey;
            return (
              <li key={key}>
                <button
                  type="button"
                  className={
                    on
                      ? `${vStyles.sideItem} ${vStyles.sideItemOn}`
                      : vStyles.sideItem
                  }
                  aria-current={on ? "true" : undefined}
                  onClick={() => selectSection(key)}
                >
                  <span className={vStyles.sideTitle}>{label}</span>
                  <span className={vStyles.sideHint}>{hint}</span>
                  <span className={vStyles.sideMeta}>
                    <span>{cur ? formatTime(cur.createdAt) : "—"}</span>
                    <span className={styles.badge}>{list.length} 版</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        {/* ---------- 右栏：选中块的详情 ---------- */}
        <div className={vStyles.detail}>
          <header className={vStyles.detailHead}>
            <div>
              <h4 className={vStyles.detailTitle}>
                {activeSection?.label ?? activeKey}
              </h4>
              <p className={vStyles.detailHint}>
                {activeSection?.hint ?? ""}
              </p>
            </div>
            <div className={vStyles.detailHeadActions}>
              <span className={styles.badge}>
                {activeVersions.length} 个版本
              </span>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnPrimary}`}
                onClick={handleEditCurrent}
              >
                编辑内容
              </button>
            </div>
          </header>

          {actionErr ? (
            <p className={styles.err} role="alert">
              {actionErr}
            </p>
          ) : null}

          {/* ---- 版本列表 ---- */}
          <p className={vStyles.sectionLabel}>版本历史</p>
          {versionsLoading && !activeVersions.length ? (
            <p className={styles.pageSub}>版本历史加载中…</p>
          ) : null}

          {!versionsLoading && versionsErr && !activeVersions.length ? (
            <div className={styles.emptyState}>
              <p className={styles.emptyStateTitle}>版本历史加载失败</p>
              <p className={styles.emptyStateBody}>{versionsErr}</p>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnSecondary}`}
                onClick={onReloadVersions}
              >
                重试
              </button>
            </div>
          ) : null}

          {!versionsLoading && !versionsErr && !activeVersions.length ? (
            <div className={styles.emptyState}>
              <p className={styles.emptyStateTitle}>暂无版本历史</p>
              <p className={styles.emptyStateBody}>
                这一块还没有发布过版本。点「编辑内容」保存一次就会生成第一个版本，
                之后每次保存都会追加一条，历史不会被覆盖。
              </p>
            </div>
          ) : null}

          {activeVersions.length ? (
            <ul className={vStyles.versionList} aria-label="版本历史">
              {activeVersions.map((v) => {
                const on = v.id === draftVersionId;
                return (
                  <li
                    key={v.id}
                    className={
                      on
                        ? `${vStyles.versionItem} ${vStyles.versionItemOn}`
                        : vStyles.versionItem
                    }
                  >
                    <span className={vStyles.versionNo}>
                      #{v.id}
                      {v.isCurrent ? (
                        <span className={vStyles.badgeCurrent}>当前生效</span>
                      ) : null}
                    </span>
                    <span className={vStyles.versionBody}>
                      <span className={vStyles.versionMeta}>
                        <span>{formatTime(v.createdAt)}</span>
                        <span>{v.createdBy ? v.createdBy : "系统"}</span>
                        {v.basedOnId ? (
                          <span>基于 #{v.basedOnId}</span>
                        ) : null}
                      </span>
                      <span className={vStyles.versionSummary}>
                        {summarizeSection(v.key, v.content)}
                      </span>
                    </span>
                    <span className={vStyles.versionActions}>
                      <button
                        type="button"
                        className={`${styles.btn} ${styles.btnSecondary}`}
                        onClick={() => handleEdit(v)}
                        aria-label={`编辑版本 ${v.id}`}
                      >
                        编辑
                      </button>
                      <button
                        type="button"
                        className={`${styles.btn} ${styles.btnGhost}`}
                        onClick={() => void handleRestore(v)}
                        disabled={v.isCurrent}
                        aria-label={`恢复版本 ${v.id}`}
                      >
                        恢复
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : null}

          {/* ---- 编辑器（弹框）----
              编辑器不再内联在右栏：12 个块的表单都很长，内联会把
              版本历史挤到屏幕外。点「编辑内容」或版本行的「编辑」打开。 */}
          {editorOpen ? (
            <ContentEditorModal
              title={`编辑 · ${activeSection?.label ?? activeKey}`}
              hint={
                draftVersion
                  ? `正在编辑版本 #${draftVersion.id} 的内容。保存 = 以它为基础发布一个新版本（历史保留）。`
                  : "当前没有历史版本。保存 = 生成这一块的第一个版本。"
              }
              onRequestClose={() => void handleRequestCloseEditor()}
            >
              <div
                className={editorStyles.editor}
                key={editorKey}
                aria-label="内容编辑器"
              >
                {activeKey === "hero" ? (
                  <HeroEditor {...editorProps} />
                ) : activeKey === "about" ? (
                  <AboutEditor {...editorProps} />
                ) : activeKey === "subscribe" ? (
                  <SubscribeEditor {...editorProps} />
                ) : activeKey === "footer" ? (
                  <FooterEditor {...editorProps} />
                ) : activeKey === "story" ? (
                  <StoryEditor {...editorProps} />
                ) : activeKey === "nav" ? (
                  <NavEditor {...editorProps} />
                ) : activeKey === "interlude01" ? (
                  <InterludeEditor {...editorProps} showEmphasis />
                ) : activeKey === "interlude03" ? (
                  <InterludeEditor {...editorProps} showEmphasis={false} />
                ) : activeKey === "coords" ? (
                  <CoordsEditor {...editorProps} />
                ) : activeKey === "worksIntro" ? (
                  <WorksIntroEditor {...editorProps} />
                ) : activeKey === "site" ? (
                  <SiteEditor {...editorProps} />
                ) : (
                  <SeriesEditor {...editorProps} />
                )}
              </div>
            </ContentEditorModal>
          ) : null}
        </div>
      </div>
    </section>
  );
}
