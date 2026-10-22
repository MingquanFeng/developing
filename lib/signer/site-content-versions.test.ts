/**
 * lib/signer/site-content 版本流单测
 * ------------------------------------------------------------------
 * 测四件事：
 *   1. seed 也会写一条基线版本（created_by = null）
 *   2. publish 追加版本：旧版本内容不变、is_current 恒有一条、版本链
 *      串得起来、失败时事务回滚不留下半截
 *   3. reset 追加「默认内容」版本 + 删掉 site_content 的覆盖行
 *   4. 迁移回填幂等（跑两次不会多出重复版本）
 *
 * 另外测 photoId 这个可选字段的守卫行为。
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
  `site-content-versions-test-${process.pid}-${Date.now()}.db`,
);

/* 必须在 import 持久层之前设 —— _db.ts 加载时读 env 决定 DB 路径 */
process.env.USERS_DB_PATH = TMP_DB;

const { db } = await import("@/lib/signer/_db");
const {
  isValidSection,
  getSiteSection,
  seedSiteContentIfEmpty,
  publishSiteSection,
  resetSiteSectionToDefault,
  listSiteContentVersions,
  getSiteContentVersion,
  backfillSiteContentVersions,
  MAX_VERSIONS_PER_KEY,
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

/** 发布出去的新版本 —— 只改标题行，别的都不动 */
const CHANGED_HERO = {
  ...VALID_HERO,
  titleLines: ["新版", "首屏"],
};

/** 「重置为默认」时写回版本流的那份内容 */
const DEFAULT_HERO = {
  ...VALID_HERO,
  titleLines: ["默认", "首屏"],
};

const VALID_ABOUT = {
  kicker: "— 第七幕 / 关于",
  titleLines: ["一间关于", "面孔", "的工作室。"],
  titleEmphasisIndex: 1,
  ledeTop: "一位先锋人像摄影师",
  ledeHighlight: "《新周刊》",
  portrait: "https://example.com/p.jpg",
  portraitAlt: "肖像",
  portraitCap: "肖像说明",
  exhibitions: [{ year: "2024", text: "《面孔》" }],
  press: [{ year: "2024", text: "《人像志》" }],
  cta: { label: "委托肖像", href: "#contact" },
  ctaSecondary: "下载艺术家手册",
};

const VALID_STORY = {
  tag: "— 主推故事 / 05",
  titleMain: "静蓝",
  titleSub: "PORTRAIT",
  image: "https://example.com/s.jpg",
  imageAlt: "大理扎染师肖像",
  copy: "一位大理扎染师，六个月的凝视",
  cta: { label: "阅读全文", href: "#" },
  caption: "随笔 · 12 分钟",
  meta: [
    { label: "发布", value: "2024 · 09 · 22" },
    { label: "对象", value: "一位" },
    { label: "快门", value: "47" },
    { label: "跨度", value: "六个月" },
  ],
};

const VALID_SERIES = [
  {
    key: "shanghai",
    albumSlug: "shanghai-0317",
    no: "01",
    name: "上海 03:17",
    meta: "弄堂 · 2024 · 35MM",
    note: "七位夜行人",
    image: "https://example.com/1.jpg",
    imageAlt: "上海 03:17 — 对象 01",
    figLabel: "001 / 上海 03:17",
    figCaption: "对象 01 · 弄堂 · 凌晨",
  },
];

const VALID_SITE = {
  name: "塞上空许",
  nameEn: "YAN",
  title: "塞上空许 — 至静之极",
  description: "先锋人像摄影师",
  projectName: "developing",
  edition: 47,
  foundedYear: 2014,
  cities: ["上海", "北京", "大理"],
  marquee: ["工作室 — 上海", "人像志 · 卷 47"],
};

/**
 * 每个用例从同一起点开始：表清空 → seed 一份 hero。
 * 不这样做，用例之间会互相污染（上一条 publish 的版本还在库里）。
 */
beforeEach(() => {
  db.exec("DELETE FROM site_content_versions");
  db.exec("DELETE FROM site_content");
  seedSiteContentIfEmpty({ hero: VALID_HERO });
});

/* ============================================================
   seed 的基线版本
   ============================================================ */

describe("seed 的基线版本", () => {
  it("seed 写 site_content 的同时写一条版本（created_by = null）", () => {
    const versions = listSiteContentVersions("hero");
    expect(versions).toHaveLength(1);
    expect(versions[0].createdBy).toBeNull();
    expect(versions[0].isCurrent).toBe(true);
    expect(versions[0].basedOnId).toBeNull();
    expect(versions[0].content).toEqual(VALID_HERO);
  });

  it("seed 幂等：表非空时不再写第二条版本", () => {
    seedSiteContentIfEmpty({ hero: VALID_HERO });
    expect(listSiteContentVersions("hero")).toHaveLength(1);
  });
});

/* ============================================================
   publish —— 追加写
   ============================================================ */

describe("publishSiteSection", () => {
  it("追加一条版本：seed 的 + 新发的 = 2 条", () => {
    const { versionId } = publishSiteSection(
      "hero",
      CHANGED_HERO,
      "usr_admin",
    );
    const versions = listSiteContentVersions("hero");
    expect(versions).toHaveLength(2);
    expect(versions[0].id).toBe(versionId);
    expect(versions[0].content).toEqual(CHANGED_HERO);
    expect(versions[0].createdBy).toBe("usr_admin");
  });

  it("is_current 恒有且只有一条", () => {
    publishSiteSection("hero", CHANGED_HERO, "usr_admin");
    publishSiteSection("hero", DEFAULT_HERO, "usr_admin2");
    const versions = listSiteContentVersions("hero");
    expect(versions).toHaveLength(3);
    expect(versions.filter((v) => v.isCurrent)).toHaveLength(1);
    expect(versions[0].isCurrent).toBe(true);
  });

  it("旧版本内容不变（历史不会被覆盖）", () => {
    publishSiteSection("hero", CHANGED_HERO, "usr_admin");
    const versions = listSiteContentVersions("hero");
    expect(versions[1].content).toEqual(VALID_HERO);
    expect(versions[1].isCurrent).toBe(false);
  });

  it("updatedAt 与版本的 createdAt 是同一个时间戳", () => {
    const { updatedAt, versionId } = publishSiteSection(
      "hero",
      CHANGED_HERO,
      "usr_admin",
    );
    const latest = getSiteContentVersion(versionId);
    expect(latest?.createdAt).toBe(updatedAt);
  });

  it("basedOnId 串起版本链", () => {
    const base = listSiteContentVersions("hero")[0];
    publishSiteSection("hero", CHANGED_HERO, "usr_admin", base.id);
    const latest = listSiteContentVersions("hero")[0];
    expect(latest.basedOnId).toBe(base.id);
  });

  it("basedOnId 省略 → null（从当前版本改）", () => {
    publishSiteSection("hero", CHANGED_HERO, "usr_admin");
    expect(listSiteContentVersions("hero")[0].basedOnId).toBeNull();
  });

  it("site_content 跟着更新（页面读的是这张表）", () => {
    publishSiteSection("hero", CHANGED_HERO, "usr_admin");
    expect(getSiteSection("hero")).toEqual(CHANGED_HERO);
  });

  it("形状非法 → 抛 invalid_section_shape，且不留下半截状态", () => {
    expect(() =>
      publishSiteSection("hero", { tags: "错" } as never, "usr_admin"),
    ).toThrowError(/invalid_section_shape/);

    /* 事务回滚：版本表没多、current 仍只有一条、内容没变 */
    const versions = listSiteContentVersions("hero");
    expect(versions).toHaveLength(1);
    expect(versions.filter((v) => v.isCurrent)).toHaveLength(1);
    expect(getSiteSection("hero")).toEqual(VALID_HERO);
  });
});

/* ============================================================
   reset —— 追加默认版本 + 删覆盖行
   ============================================================ */

describe("resetSiteSectionToDefault", () => {
  it("追加一条默认内容的版本，并删掉 site_content 的覆盖行", () => {
    publishSiteSection("hero", CHANGED_HERO, "usr_admin");
    const before = listSiteContentVersions("hero");

    const { versionId } = resetSiteSectionToDefault(
      "hero",
      DEFAULT_HERO,
      "usr_admin2",
    );

    const after = listSiteContentVersions("hero");
    expect(after).toHaveLength(before.length + 1);
    expect(after[0].id).toBe(versionId);
    expect(after[0].content).toEqual(DEFAULT_HERO);
    expect(after[0].createdBy).toBe("usr_admin2");
    expect(after[0].isCurrent).toBe(true);

    /* 覆盖行没了 → 读取回落静态默认 */
    expect(getSiteSection("hero")).toBeNull();
  });

  it("based_on_id 指向重置前的当前版本", () => {
    const published = publishSiteSection("hero", CHANGED_HERO, "usr_admin");
    const { versionId } = resetSiteSectionToDefault(
      "hero",
      DEFAULT_HERO,
      "usr_admin",
    );
    expect(getSiteContentVersion(versionId)?.basedOnId).toBe(published.versionId);
  });

  it("重置后 is_current 仍只有一条", () => {
    publishSiteSection("hero", CHANGED_HERO, "usr_admin");
    resetSiteSectionToDefault("hero", DEFAULT_HERO, "usr_admin");
    const versions = listSiteContentVersions("hero");
    expect(versions.filter((v) => v.isCurrent)).toHaveLength(1);
  });

  it("默认内容形状非法 → 抛 invalid_section_shape", () => {
    expect(() =>
      resetSiteSectionToDefault("hero", { tags: "错" } as never, "usr_admin"),
    ).toThrowError(/invalid_section_shape/);
    expect(getSiteSection("hero")).toEqual(VALID_HERO);
  });
});

/* ============================================================
   迁移回填
   ============================================================ */

describe("backfillSiteContentVersions", () => {
  it("site_content 有行但没有版本 → 补一条基线版本", () => {
    /* 模拟老部署：内容在，内容历史不在 */
    db.exec("DELETE FROM site_content_versions");
    expect(getSiteSection("hero")).toEqual(VALID_HERO);

    backfillSiteContentVersions();

    const versions = listSiteContentVersions("hero");
    expect(versions).toHaveLength(1);
    expect(versions[0].content).toEqual(VALID_HERO);
    expect(versions[0].isCurrent).toBe(true);
    expect(versions[0].basedOnId).toBeNull();
  });

  it("回填的 created_at / created_by 取自 site_content 的原值", () => {
    const seeded = listSiteContentVersions("hero")[0];
    db.exec("DELETE FROM site_content_versions");
    backfillSiteContentVersions();
    const backfilled = listSiteContentVersions("hero")[0];
    expect(backfilled.createdAt).toBe(seeded.createdAt);
    expect(backfilled.createdBy).toBeNull();
  });

  it("幂等：跑两次不会多出重复版本", () => {
    db.exec("DELETE FROM site_content_versions");
    backfillSiteContentVersions();
    backfillSiteContentVersions();
    backfillSiteContentVersions();
    expect(listSiteContentVersions("hero")).toHaveLength(1);
  });

  it("已有版本的 key 不被动（不回填重复行）", () => {
    publishSiteSection("hero", CHANGED_HERO, "usr_admin");
    const before = listSiteContentVersions("hero");
    backfillSiteContentVersions();
    expect(listSiteContentVersions("hero")).toHaveLength(before.length);
  });
});

/* ============================================================
   列表 / 单条
   ============================================================ */

describe("listSiteContentVersions / getSiteContentVersion", () => {
  it("不带 key → 返回全部 key 的版本，按 section_key ASC、id DESC", () => {
    publishSiteSection("hero", CHANGED_HERO, "usr_admin");
    /* 再塞一节别的 key */
    db.prepare(
      `INSERT INTO site_content (section_key, content, updated_at, updated_by)
       VALUES ('about', ?, ?, NULL)`,
    ).run(JSON.stringify(VALID_ABOUT), new Date().toISOString());
    db.prepare(
      `INSERT INTO site_content_versions
         (section_key, content, created_at, created_by, is_current, based_on_id)
       VALUES ('about', ?, ?, NULL, 1, NULL)`,
    ).run(JSON.stringify(VALID_ABOUT), new Date().toISOString());

    const all = listSiteContentVersions();
    expect(all.length).toBeGreaterThanOrEqual(3);
    const keys = all.map((v) => v.key);
    expect([...keys].sort()).toEqual(keys); // section_key 升序
    /* 同一 key 内 id 降序 */
    const heroIds = all.filter((v) => v.key === "hero").map((v) => v.id);
    expect(heroIds).toEqual([...heroIds].sort((a, b) => b - a));
  });

  it("带 key → 只返回该 key 的版本", () => {
    publishSiteSection("hero", CHANGED_HERO, "usr_admin");
    const all = listSiteContentVersions();
    expect(all.every((v) => v.key === "hero")).toBe(true);
  });

  it("getSiteContentVersion 按 id 取单条；找不到返回 null", () => {
    const { versionId } = publishSiteSection(
      "hero",
      CHANGED_HERO,
      "usr_admin",
    );
    const one = getSiteContentVersion(versionId);
    expect(one?.id).toBe(versionId);
    expect(one?.content).toEqual(CHANGED_HERO);
    expect(getSiteContentVersion(999999)).toBeNull();
  });

  it("内容 JSON 损坏的那条被跳过（不让整个列表 500）", () => {
    publishSiteSection("hero", CHANGED_HERO, "usr_admin");
    db.prepare(
      `INSERT INTO site_content_versions
         (section_key, content, created_at, created_by, is_current, based_on_id)
       VALUES ('hero', ?, ?, NULL, 0, NULL)`,
    ).run("{ 这不是 JSON", new Date().toISOString());

    const versions = listSiteContentVersions("hero");
    expect(versions).toHaveLength(2);
    expect(versions.every((v) => v.key === "hero")).toBe(true);
  });

  it("每块最多返回 MAX_VERSIONS_PER_KEY 条（最新的那些）", () => {
    /* 版本内容是完整快照，全量返回会随发布次数无界膨胀。
       这里验证窗口生效：历史仍在 DB 里，但响应被截断。 */
    for (let i = 0; i < MAX_VERSIONS_PER_KEY + 5; i++) {
      publishSiteSection("hero", CHANGED_HERO, "usr_admin");
    }
    const versions = listSiteContentVersions("hero");
    expect(versions).toHaveLength(MAX_VERSIONS_PER_KEY);
    /* 当前生效版本必然在窗口里（它是最新的一条） */
    expect(versions[0].isCurrent).toBe(true);
    /* 窗口是「最新 N 条」，不是「最旧 N 条」 */
    expect(versions[0].id).toBeGreaterThan(versions[versions.length - 1].id);
    /* DB 里一条没少 —— 截断只发生在返回层 */
    const n = db
      .prepare(
        "SELECT COUNT(*) AS n FROM site_content_versions WHERE section_key = ?",
      )
      .get("hero") as { n: number };
    expect(n.n).toBe(MAX_VERSIONS_PER_KEY + 6); // +1 = beforeEach 的 seed 基线
  });
});

/* ============================================================
   photoId —— 可选字段的守卫
   ============================================================ */

describe("photoId 可选字段", () => {
  it("hero：photoId 缺失 / null / string 都合法", () => {
    expect(isValidSection("hero", VALID_HERO)).toBe(true);
    expect(isValidSection("hero", { ...VALID_HERO, photoId: null })).toBe(true);
    expect(isValidSection("hero", { ...VALID_HERO, photoId: "ph_123" })).toBe(
      true,
    );
  });

  it("hero：photoId 既不是 string 也不是 null → 拒绝", () => {
    expect(isValidSection("hero", { ...VALID_HERO, photoId: 123 })).toBe(false);
    expect(isValidSection("hero", { ...VALID_HERO, photoId: {} })).toBe(false);
    expect(isValidSection("hero", { ...VALID_HERO, photoId: ["a"] })).toBe(
      false,
    );
  });

  it("about / story / series：同样接受可选 photoId", () => {
    expect(isValidSection("about", { ...VALID_ABOUT, photoId: null })).toBe(
      true,
    );
    expect(isValidSection("about", { ...VALID_ABOUT, photoId: "ph_1" })).toBe(
      true,
    );
    expect(isValidSection("about", { ...VALID_ABOUT, photoId: 7 })).toBe(false);

    expect(isValidSection("story", { ...VALID_STORY, photoId: null })).toBe(
      true,
    );
    expect(isValidSection("story", { ...VALID_STORY, photoId: "ph_1" })).toBe(
      true,
    );
    expect(isValidSection("story", { ...VALID_STORY, photoId: false })).toBe(
      false,
    );

    const withPhoto = [
      { ...VALID_SERIES[0], photoId: "ph_1" },
      { ...VALID_SERIES[0], key: "beijing", photoId: null },
    ];
    expect(isValidSection("series", withPhoto)).toBe(true);
    expect(
      isValidSection("series", [{ ...VALID_SERIES[0], photoId: 9 }]),
    ).toBe(false);
  });

  it("site 仍走严格键集合（没有图片，也不接受 photoId）", () => {
    expect(isValidSection("site", VALID_SITE)).toBe(true);
    expect(isValidSection("site", { ...VALID_SITE, photoId: null })).toBe(false);
  });
});
