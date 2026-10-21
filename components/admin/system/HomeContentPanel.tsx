"use client";

/**
 * HomeContentPanel —— 系统设置页的"首页内容"节
 * ------------------------------------------------------------------
 * 4 个可折叠子表单（hero/about/subscribe/footer）+ 顶部"全部重置"。
 * 每个 editor 自己管 local state：保存 / 重置走父组件传下来的 callback。
 */
import { useMemo } from "react";
import type { SiteSectionKey } from "@/lib/contracts";
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
import type { Writable } from "./editors/_writable";
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

export type HomeContentPanelProps = {
  data: SiteContentDraft;
  busy: SiteSectionKey | null;
  onSave: (key: SiteSectionKey, content: unknown) => Promise<void>;
  onReset: (key: SiteSectionKey) => Promise<void>;
  onRequestConfirm: (opts: {
    title: string;
    body: string;
    danger?: boolean;
    confirmLabel?: string;
    cancelLabel?: string;
  }) => Promise<boolean>;
};

const SECTIONS: ReadonlyArray<{
  key: SiteSectionKey;
  label: string;
  hint: string;
}> = [
  { key: "hero", label: "首屏 HERO", hint: "满屏肖像 + 大字标题 + 四栏元信息" },
  {
    key: "about",
    label: "第七幕 · 关于",
    hint: "摄影师介绍、双栏 + 展览 / 出版",
  },
  {
    key: "subscribe",
    label: "第八幕 · 订阅",
    hint: "newsletter 表单",
  },
  { key: "footer", label: "第九幕 · 页脚", hint: "三栏 + 底栏" },
  { key: "story", label: "第五幕 · 主推故事", hint: "满屏肖像 + 副标 + 阅读入口" },
  { key: "nav", label: "顶导航", hint: "内容项文案与链接" },
  {
    key: "interlude01",
    label: "第二幕 · 手记 01",
    hint: "关于面孔 · 引文 + 强调行",
  },
  {
    key: "interlude03",
    label: "第六幕 · 手记 03",
    hint: "工作方法 · 引文",
  },
  {
    key: "coords",
    label: "第四幕 · 手记 02",
    hint: "对象与坐标表（可增删行）",
  },
  {
    key: "worksIntro",
    label: "第三幕 · 人像志介绍",
    hint: "WORKS 顶部标题与文案",
  },
  {
    key: "site",
    label: "站点 meta",
    hint: "标题 / 描述 / 品牌名 / 跑马灯（影响 SEO）",
  },
  {
    key: "series",
    label: "第三幕 · 作品系列",
    hint: "5 组系列的文案（封面图另在「封面管理」设）",
  },
];

export default function HomeContentPanel({
  data,
  busy,
  onSave,
  onReset,
  onRequestConfirm,
}: HomeContentPanelProps) {
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

  return (
    <section
      className={styles.section}
      aria-label="首页内容编辑"
    >
      <header className={styles.sectionHeader}>
        <h3 className={styles.sectionTitle}>首页内容编辑</h3>
        <span className={styles.pageSub}>
          改完保存会立刻刷新首页（无需重新部署）
        </span>
      </header>

      <div className={editorStyles.editor}>
        {SECTIONS.map(({ key, label, hint }) => {
          const draft = (data[key] as never) ?? staticFallback[key];
          const editorProps = {
            data: draft,
            busy: busy === key,
            onSave: (c: unknown) => onSave(key, c),
            onReset: () => onReset(key),
            onRequestConfirm,
          };
          return (
            <details
              key={key}
              className={`${styles.card}`}
              style={{ padding: 0 }}
            >
              <summary
                style={{
                  padding: "14px 18px",
                  cursor: "pointer",
                  listStyle: "none",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontFamily:
                    "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                  fontSize: 13,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  color: "rgba(255,255,255,0.92)",
                }}
              >
                <span>
                  {label}
                  <span
                    style={{
                      marginLeft: 12,
                      fontSize: 11,
                      color: "rgba(255,255,255,0.5)",
                      textTransform: "none",
                      letterSpacing: 0,
                    }}
                  >
                    {hint}
                  </span>
                </span>
                <span
                  style={{
                    fontSize: 11,
                    color: "rgba(255,255,255,0.45)",
                    textTransform: "none",
                    letterSpacing: 0,
                  }}
                >
                  ▾
                </span>
              </summary>
              <div
                style={{
                  padding: "0 18px 18px",
                  borderTop: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                {key === "hero" ? (
                  <HeroEditor {...editorProps} />
                ) : key === "about" ? (
                  <AboutEditor {...editorProps} />
                ) : key === "subscribe" ? (
                  <SubscribeEditor {...editorProps} />
                ) : key === "footer" ? (
                  <FooterEditor {...editorProps} />
                ) : key === "story" ? (
                  <StoryEditor {...editorProps} />
                ) : key === "nav" ? (
                  <NavEditor {...editorProps} />
                ) : key === "interlude01" ? (
                  <InterludeEditor {...editorProps} showEmphasis />
                ) : key === "interlude03" ? (
                  <InterludeEditor {...editorProps} showEmphasis={false} />
                ) : key === "coords" ? (
                  <CoordsEditor {...editorProps} />
                ) : key === "worksIntro" ? (
                  <WorksIntroEditor {...editorProps} />
                ) : key === "site" ? (
                  <SiteEditor {...editorProps} />
                ) : (
                  <SeriesEditor {...editorProps} />
                )}
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}