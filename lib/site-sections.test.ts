/**
 * 站点内容块清单 —— 顺序防漂移
 * ------------------------------------------------------------------
 * 后台「站点内容」的块列表按「首页自上而下」排（顶栏 → 九幕 → 页脚）。
 * 这份顺序靠人记着，早晚会跟页面对不上 —— 所以这里**读 app/page.tsx
 * 的源码**核对渲染顺序，对不上就红。
 *
 * 为什么要读源码而不是跑页面断言：跑页面只能证明「某一块在另一块下面」，
 * 读源码能把 12 块的**完整顺序**一次性钉住，改页面顺序时立刻知道
 * 要不要同步改清单。
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SITE_SECTIONS } from "@/lib/site-sections";
import type { SiteSectionKey } from "@/lib/contracts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE_SRC = fs.readFileSync(path.join(ROOT, "app/page.tsx"), "utf-8");

/**
 * section key → app/page.tsx 里对应的 JSX 标签。
 *
 * ⚠️ 只认「<标签」—— import 语句里也有组件名，但没带尖括号，
 *    不会误判。
 */
const JSX_TAG: Record<SiteSectionKey, string> = {
  nav: "<Nav",
  site: "<MetaBar",
  hero: "<HeroSection",
  interlude01: "<JournalSection",
  /* worksIntro 与 series 是同一个组件的两个 prop（同一个「第三幕」块） */
  worksIntro: "<WorksSection",
  series: "<WorksSection",
  coords: "<CoordsSection",
  story: "<StorySection",
  interlude03: "<Interlude03Section",
  about: "<AboutSection",
  subscribe: "<SubscribeSection",
  footer: "<FooterSection",
};

/** 全部 section key（钉住「不多不少」） */
const ALL_KEYS: SiteSectionKey[] = [
  "hero",
  "about",
  "subscribe",
  "footer",
  "story",
  "nav",
  "interlude01",
  "interlude03",
  "coords",
  "worksIntro",
  "site",
  "series",
];

/** 只有这一对允许位置相同（同一个组件块里的两个 prop） */
const SHARED_BLOCK: ReadonlyArray<[SiteSectionKey, SiteSectionKey]> = [
  ["worksIntro", "series"],
];

describe("站点内容块清单", () => {
  it("覆盖全部 section key，不多不少", () => {
    const keys = SITE_SECTIONS.map((s) => s.key);
    expect([...keys].sort()).toEqual([...ALL_KEYS].sort());
  });

  it("没有重复的 key", () => {
    const keys = SITE_SECTIONS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("每块都有 label 与 hint", () => {
    for (const s of SITE_SECTIONS) {
      expect(s.label.length).toBeGreaterThan(0);
      expect(s.hint.length).toBeGreaterThan(0);
    }
  });

  it("顺序与 app/page.tsx 的渲染顺序一致", () => {
    /* 每个标签在页面源码里的位置 */
    const pos = new Map<SiteSectionKey, number>();
    for (const s of SITE_SECTIONS) {
      const tag = JSX_TAG[s.key];
      const i = PAGE_SRC.indexOf(tag);
      expect(i, `app/page.tsx 里找不到 ${tag}（${s.key}）`).toBeGreaterThan(-1);
      pos.set(s.key, i);
    }

    /* 顺着清单走，位置必须单调不减 */
    for (let i = 1; i < SITE_SECTIONS.length; i++) {
      const prev = SITE_SECTIONS[i - 1];
      const cur = SITE_SECTIONS[i];
      const shared = SHARED_BLOCK.some(
        ([a, b]) =>
          (a === prev.key && b === cur.key) || (a === cur.key && b === prev.key),
      );
      const a = pos.get(prev.key)!;
      const b = pos.get(cur.key)!;
      if (shared) {
        expect(b, `${prev.key} 与 ${cur.key} 应在同一个块里`).toBe(a);
      } else {
        expect(
          b,
          `「${prev.label}」应该排在「${cur.label}」上面 —— ` +
            `app/page.tsx 的渲染顺序变了？清单要同步改`,
        ).toBeGreaterThan(a);
      }
    }
  });
});
