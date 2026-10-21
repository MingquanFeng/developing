/**
 * lib/signer/site-content 单测
 * ------------------------------------------------------------------
 * 测两件事：
 *   1. 结构守卫 isValidSection —— 拒绝畸形内容（尤其是 nav 的 href
 *      白名单，那是 XSS 防线）
 *   2. DB 往返 —— setSiteSection / getSiteSection / resetSiteSection
 *      + seed 的幂等性
 *
 * ⚠️ 用临时 SQLite 文件，**不能碰真实的 data/users.db**。
 *    _db.ts 在模块加载时求值 DB_PATH，所以必须先设 env 再动态 import。
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TMP_DB = path.join(
  os.tmpdir(),
  `site-content-test-${process.pid}-${Date.now()}.db`,
);

/* 必须在 import 持久层之前设 —— _db.ts 加载时读 env 决定 DB 路径 */
process.env.USERS_DB_PATH = TMP_DB;

const {
  isValidSection,
  setSiteSection,
  getSiteSection,
  resetSiteSection,
  listSiteContentMeta,
  seedSiteContentIfEmpty,
} = await import("@/lib/signer/site-content");

afterAll(() => {
  for (const suffix of ["", "-shm", "-wal"]) {
    try {
      fs.unlinkSync(TMP_DB + suffix);
    } catch {
      /* 文件不存在就算了 */
    }
  }
});

/* ---------- 测试素材 ---------- */

const VALID_HERO = {
  tags: ["A — 47 / 主推"],
  titleLines: ["至静", "之极"],
  image: "https://example.com/a.jpg",
  imageAlt: "对象 01",
  sub: "一份关于面孔的视觉志",
  cta: { label: "查看作品", href: "#works" },
  caption: "对象 01",
  meta: [
    { label: "摄影师", value: "塞上空许" },
    { label: "对象", value: "11 位" },
    { label: "格式", value: "35MM" },
    { label: "版本", value: "47" },
  ],
};

const VALID_NAV = [
  { label: "作品", href: "#works" },
  { label: "相册", href: "/album/" },
];

const VALID_COORDS = {
  kicker: "— 手记 02 / 对象与坐标",
  rows: [
    {
      no: "N° 01",
      place: "上海弄堂",
      a: "对象 · 七位",
      b: "夜行人",
      time: "03:17",
    },
  ],
  sig: "每一帧是一组对象。",
};

const VALID_SITE = {
  name: "塞上空许",
  nameEn: "YAN",
  title: "塞上空许 — 至静之极",
  description: "先锋人像摄影师",
  projectName: "developing",
  edition: 47,
  foundedYear: 2014,
  cities: ["上海", "北京", "大理"],
  marquee: ["工作室 — 上海 ↔ 北京 ↔ 大理", "人像志 · 卷 47"],
};

/* ============================================================
   结构守卫
   ============================================================ */

describe("isValidSection —— hero", () => {
  it("合法内容通过", () => {
    expect(isValidSection("hero", VALID_HERO)).toBe(true);
  });

  it("缺 tags 拒绝", () => {
    const { tags, ...rest } = VALID_HERO;
    expect(isValidSection("hero", rest)).toBe(false);
  });

  it("tags 不是字符串数组拒绝", () => {
    expect(
      isValidSection("hero", { ...VALID_HERO, tags: "不是数组" }),
    ).toBe(false);
  });

  it("titleLines 不是 2 行拒绝", () => {
    expect(
      isValidSection("hero", {
        ...VALID_HERO,
        titleLines: ["只有一行"],
      }),
    ).toBe(false);
  });

  it("meta 不是 4 项拒绝", () => {
    expect(
      isValidSection("hero", { ...VALID_HERO, meta: VALID_HERO.meta.slice(0, 3) }),
    ).toBe(false);
  });

  it("cta 缺 href 拒绝", () => {
    expect(
      isValidSection("hero", {
        ...VALID_HERO,
        cta: { label: "查看作品" },
      }),
    ).toBe(false);
  });

  it("null / undefined / 非对象拒绝", () => {
    expect(isValidSection("hero", null)).toBe(false);
    expect(isValidSection("hero", undefined)).toBe(false);
    expect(isValidSection("hero", "字符串")).toBe(false);
  });
});

describe("isValidSection —— nav 的 href 白名单（XSS 防线）", () => {
  it("合法内容通过", () => {
    expect(isValidSection("nav", VALID_NAV)).toBe(true);
  });

  it("javascript: href 拒绝", () => {
    expect(
      isValidSection("nav", [{ label: "恶意", href: "javascript:alert(1)" }]),
    ).toBe(false);
  });

  it("data: href 拒绝", () => {
    expect(
      isValidSection("nav", [{ label: "恶意", href: "data:text/html,x" }]),
    ).toBe(false);
  });

  it("//协议相对 URL（指向外站）拒绝", () => {
    expect(
      isValidSection("nav", [{ label: "外站", href: "//evil.example.com" }]),
    ).toBe(false);
  });

  it("未知锚点拒绝", () => {
    expect(
      isValidSection("nav", [{ label: "坏锚点", href: "#not-a-section" }]),
    ).toBe(false);
  });

  it("相对路径拒绝", () => {
    expect(
      isValidSection("nav", [{ label: "相对", href: "album/" }]),
    ).toBe(false);
  });

  it("已知锚点接受", () => {
    for (const anchor of [
      "hero",
      "journal",
      "locations",
      "works",
      "story",
      "about",
      "contact",
    ]) {
      expect(
        isValidSection("nav", [{ label: "x", href: `#${anchor}` }]),
      ).toBe(true);
    }
  });

  it("站内绝对路径接受", () => {
    expect(
      isValidSection("nav", [{ label: "相册", href: "/album/" }]),
    ).toBe(true);
  });

  it("label 为空拒绝", () => {
    expect(
      isValidSection("nav", [{ label: "", href: "#works" }]),
    ).toBe(false);
  });

  it("缺 href 拒绝", () => {
    expect(isValidSection("nav", [{ label: "作品" }])).toBe(false);
  });

  it("非数组拒绝", () => {
    expect(isValidSection("nav", { label: "作品", href: "#works" })).toBe(
      false,
    );
  });
});

describe("isValidSection —— coords", () => {
  it("合法内容通过", () => {
    expect(isValidSection("coords", VALID_COORDS)).toBe(true);
  });

  it("rows 缺字段拒绝", () => {
    expect(
      isValidSection("coords", {
        ...VALID_COORDS,
        rows: [{ no: "N° 01" }],
      }),
    ).toBe(false);
  });

  it("rows 为空数组拒绝", () => {
    expect(
      isValidSection("coords", { ...VALID_COORDS, rows: [] }),
    ).toBe(false);
  });
});

describe("isValidSection —— site", () => {
  it("合法内容通过", () => {
    expect(isValidSection("site", VALID_SITE)).toBe(true);
  });

  it("缺 name 拒绝", () => {
    const { name, ...rest } = VALID_SITE;
    expect(isValidSection("site", rest)).toBe(false);
  });

  it("marquee 不是 2 行拒绝", () => {
    expect(
      isValidSection("site", {
        ...VALID_SITE,
        marquee: ["只有一行"],
      }),
    ).toBe(false);
  });

  it("edition 非数字拒绝", () => {
    expect(
      isValidSection("site", { ...VALID_SITE, edition: "47" }),
    ).toBe(false);
  });

  it("cities 非字符串数组拒绝", () => {
    expect(
      isValidSection("site", { ...VALID_SITE, cities: [1, 2] }),
    ).toBe(false);
  });
});

describe("isValidSection —— interlude01/03 + worksIntro", () => {
  it("interlude01 合法通过", () => {
    expect(
      isValidSection("interlude01", {
        kicker: "— 手记 01",
        quote: ["肖像是一种", "互相交还的功课"],
        emphasisIndex: 1,
        sig: "— 塞上空许",
      }),
    ).toBe(true);
  });

  it("interlude01 quote 空数组拒绝", () => {
    expect(
      isValidSection("interlude01", {
        kicker: "x",
        quote: [],
        emphasisIndex: 0,
        sig: "",
      }),
    ).toBe(false);
  });

  it("interlude03 合法通过", () => {
    expect(
      isValidSection("interlude03", {
        kicker: "— 手记 03",
        quote: ["我只拍摄"],
        sig: "",
      }),
    ).toBe(true);
  });

  it("worksIntro 合法通过", () => {
    expect(
      isValidSection("worksIntro", {
        kicker: "— 第三幕",
        titleLines: ["精选", "人像"],
        titleSuffix: "肖像",
        intro: "五组人像",
        frameHint: "悬停切换",
      }),
    ).toBe(true);
  });

  it("worksIntro titleLines 空数组拒绝", () => {
    expect(
      isValidSection("worksIntro", {
        kicker: "x",
        titleLines: [],
        titleSuffix: "肖像",
        intro: "y",
        frameHint: "z",
      }),
    ).toBe(false);
  });
});

/* ============================================================
   DB 往返
   ============================================================ */

describe("setSiteSection / getSiteSection / resetSiteSection", () => {
  beforeEach(() => {
    resetSiteSection("hero");
    resetSiteSection("nav");
  });

  it("写入后能读回", () => {
    const r = setSiteSection("hero", VALID_HERO, "usr_test");
    expect(typeof r.updatedAt).toBe("string");
    expect(getSiteSection("hero")).toEqual(VALID_HERO);
  });

  it("未写过的 key 返回 null", () => {
    expect(getSiteSection("subscribe")).toBeNull();
  });

  it("reset 后回落 null", () => {
    setSiteSection("hero", VALID_HERO, "usr_test");
    resetSiteSection("hero");
    expect(getSiteSection("hero")).toBeNull();
  });

  it("形状非法时抛 invalid_section_shape 且不写库", () => {
    expect(() =>
      setSiteSection("hero", { tags: "错" } as never, "usr_test"),
    ).toThrowError(/invalid_section_shape/);
    expect(getSiteSection("hero")).toBeNull();
  });

  it("meta 记录 updatedAt + updatedBy", () => {
    setSiteSection("nav", VALID_NAV, "usr_actor");
    const meta = listSiteContentMeta();
    const nav = meta.find((m) => m.key === "nav");
    expect(nav?.updatedBy).toBe("usr_actor");
    expect(typeof nav?.updatedAt).toBe("string");
  });
});

describe("seedSiteContentIfEmpty 的幂等性", () => {
  it("表为空时写入；表非空时不覆盖已有覆盖值", () => {
    /* 先写一条覆盖值，seed 不应动它 */
    setSiteSection("hero", VALID_HERO, "usr_test");
    seedSiteContentIfEmpty({
      hero: { ...VALID_HERO, titleLines: ["SEED", "SHOULD-NOT-WIN"] },
      about: {},
    } as never);

    /* 已有覆盖值保持不变 */
    expect(
      (getSiteSection<typeof VALID_HERO>("hero")?.titleLines ?? [])[0],
    ).toBe("至静");
  });
});
