/**
 * lib/data/site-content 单测
 * ------------------------------------------------------------------
 * 测 async helper 的回落语义：
 *   - DB 没有覆盖值 → 回落 lib/data 静态默认
 *   - DB 有覆盖值 → 用覆盖值
 *   - listHomeContent 一次拉齐 11 节
 *
 * ⚠️ 用临时 SQLite 文件，不碰真实的 data/users.db。
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TMP_DB = path.join(
  os.tmpdir(),
  `site-content-data-test-${process.pid}-${Date.now()}.db`,
);

/* 必须在 import 持久层之前设 —— _db.ts 加载时读 env 决定 DB 路径 */
process.env.USERS_DB_PATH = TMP_DB;

const { setSiteSection, resetSiteSection } = await import(
  "@/lib/signer/site-content"
);
const {
  getHero,
  getNav,
  getSiteMeta,
  listHomeContent,
  seedHomeContentFromDefaults,
} = await import("@/lib/data/site-content");
const { hero: heroStatic } = await import("@/lib/data/home");
const { nav: navStatic } = await import("@/lib/data/nav");
const { site: siteStatic } = await import("@/lib/data/site");

/** site 的可编辑部分（去掉 locale —— 它刻意不进 DB） */
const SITE_EDITABLE = (() => {
  const { locale, ...rest } = siteStatic;
  void locale;
  return rest;
})();

afterAll(() => {
  for (const suffix of ["", "-shm", "-wal"]) {
    try {
      fs.unlinkSync(TMP_DB + suffix);
    } catch {
      /* 文件不存在就算了 */
    }
  }
});

describe("async helper 的回落语义", () => {
  beforeEach(() => {
    resetSiteSection("hero");
    resetSiteSection("nav");
    resetSiteSection("site");
  });

  it("DB 无覆盖值 → 回落静态默认（引用相等）", async () => {
    expect(await getHero()).toBe(heroStatic);
  });

  it("DB 有覆盖值 → 返回覆盖值", async () => {
    const next = { ...heroStatic, titleLines: ["动态", "首屏"] };
    setSiteSection("hero", next, "usr_test");
    const got = await getHero();
    expect(got.titleLines).toEqual(["动态", "首屏"]);
    expect(got).not.toBe(heroStatic);
  });

  it("nav 同样有回落语义", async () => {
    expect(await getNav()).toBe(navStatic);
  });

  it("getSiteMeta 不含 locale（locale 静态不进 DB）", async () => {
    const s = await getSiteMeta();
    expect("locale" in s).toBe(false);
    expect(s.name).toBe(siteStatic.name);
  });

  it("getSiteMeta 读到 DB 覆盖值（不含 locale）", async () => {
    setSiteSection(
      "site",
      { ...SITE_EDITABLE, name: "被改过的站名" },
      "usr_test",
    );
    const s = await getSiteMeta();
    expect("locale" in s).toBe(false);
    expect(s.name).toBe("被改过的站名");
  });

  it("带 locale 字段的 site 被守卫拒绝（locale 不在动态化范围）", () => {
    expect(() =>
      setSiteSection(
        "site",
        { ...SITE_EDITABLE, locale: "en-US" } as never,
        "usr_test",
      ),
    ).toThrowError(/invalid_section_shape/);
  });
});

describe("listHomeContent", () => {
  it("一次拉齐 11 节", async () => {
    const all = await listHomeContent();
    const keys = Object.keys(all).sort();
    expect(keys).toEqual(
      [
        "about",
        "coords",
        "footer",
        "hero",
        "interlude01",
        "interlude03",
        "nav",
        "site",
        "story",
        "subscribe",
        "worksIntro",
      ].sort(),
    );
  });

  it("各节都能取到值（不 undefined）", async () => {
    const all = await listHomeContent();
    for (const [k, v] of Object.entries(all)) {
      expect(v, `${k} 不该是 undefined`).toBeDefined();
    }
  });
});

describe("seedHomeContentFromDefaults 的幂等性", () => {
  it("表为空时写入默认值", () => {
    seedHomeContentFromDefaults();
    /* 再读一次应拿到静态默认（seed 写的也是默认值） */
    return getHero().then((h) => {
      expect(h.titleLines).toEqual(heroStatic.titleLines);
    });
  });

  it("已有覆盖值时不被 seed 覆盖", async () => {
    resetSiteSection("hero");
    setSiteSection(
      "hero",
      { ...heroStatic, titleLines: ["不该", "被覆盖"] },
      "usr_test",
    );
    seedHomeContentFromDefaults();
    const h = await getHero();
    expect(h.titleLines).toEqual(["不该", "被覆盖"]);
  });
});
