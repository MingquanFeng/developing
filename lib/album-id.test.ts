/**
 * lib/album-id 单测
 * ------------------------------------------------------------------
 * 纯函数测试，不依赖任何运行时副作用。
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SLUG,
  FALLBACK_SLUG,
  MISC_SLUG,
  defaultAlbum,
  fallbackAlbum,
  newAlbumId,
  slugify,
} from "@/lib/album-id";
import type { Album } from "@/lib/contracts";

describe("slugify", () => {
  it("纯英文 + 数字保留并归 -", () => {
    expect(slugify("  Hello   World 2026! ")).toBe("hello-world-2026");
  });

  it("汉字保留，标点归 -", () => {
    expect(slugify("塞上空许 · 私人相册")).toBe("塞上空许-私人相册");
  });

  it("混合 + 特殊字符 + 长度上限", () => {
    // 49 字符名，截到 40；非字母数字汉字段归 -
    const long = "「端到端验证.jpg」".repeat(2);
    const s = slugify(long);
    expect(s.length).toBeLessThanOrEqual(40);
    expect(s).not.toMatch(/^-|-$/);
    expect(s).not.toMatch(/[^a-z0-9一-鿿豈-﫿-]/);
  });

  it("全标点 / 空字符串回退到 album", () => {
    expect(slugify("")).toBe("album");
    expect(slugify("!!!")).toBe("album");
    expect(slugify("    ")).toBe("album");
  });
});

describe("newAlbumId", () => {
  it("空 taken → 永远返回 _1", () => {
    expect(newAlbumId("u1", "default", new Set())).toBe("alb_u1_default_1");
    expect(newAlbumId("u1", DEFAULT_SLUG, new Set())).toBe("alb_u1_default_1");
  });

  it("taken 含 _1 → 返回 _2", () => {
    const taken = new Set(["alb_u1_default_1"]);
    expect(newAlbumId("u1", "default", taken)).toBe("alb_u1_default_2");
  });

  it("ownerId 含特殊字符也安全（slugify 处理）", () => {
    // ownerId 不走 slugify；本约定就是 ownerId 是合法 userId（usr_xxx）
    const id = newAlbumId("usr_abc-123", "default", new Set());
    expect(id).toBe("alb_usr_abc-123_default_1");
  });

  it("空 ownerId 兜底 anon", () => {
    expect(newAlbumId("", "default", new Set())).toBe("alb_anon_default_1");
  });

  it("slug 含全角空格归 - 后接 n", () => {
    expect(newAlbumId("u", "我的  相册", new Set())).toBe("alb_u_我的-相册_1");
  });
});

describe("defaultAlbum", () => {
  it("返回合法 Album，id 走 newAlbumId", () => {
    const a = defaultAlbum("u1");
    expect(a.id).toBe("alb_u1_default_1");
    expect(a.slug).toBe(DEFAULT_SLUG);
    expect(a.name).toBe("默认相册");
    expect(a.desc).toBe("不属于任何一次的随手记录。");
    expect(a.coverKey).toBeNull();
    expect(a.order).toBe(1);
    expect(a.ownerId).toBe("u1");
  });

  it("已有 default slug 时避开撞 id", () => {
    const existing: Album[] = [
      { ...defaultAlbum("u1"), id: "alb_u1_default_1" },
    ];
    const a = defaultAlbum("u1", existing);
    expect(a.id).toBe("alb_u1_default_2");
  });

  it("与 MISC_SLUG 兼容：不同 owner 互不撞", () => {
    const existing: Album[] = [{ ...defaultAlbum("u1"), slug: MISC_SLUG }];
    const a = defaultAlbum("u2", existing);
    expect(a.id).toBe("alb_u2_default_1");
  });
});

describe("fallbackAlbum", () => {
  it("返回合法 Album，order=999", () => {
    const a = fallbackAlbum("u1");
    expect(a.id).toBe("alb_u1_fallback_1");
    expect(a.slug).toBe(FALLBACK_SLUG);
    expect(a.name).toBe("回收相册");
    expect(a.desc).toBe("从已删除相册转移来的照片。");
    expect(a.order).toBe(999);
    expect(a.ownerId).toBe("u1");
  });

  it("已存在 fallback 时仍递增（caller 按 id 查重再决定加否）", () => {
    const existing: Album[] = [
      { ...fallbackAlbum("u1"), id: "alb_u1_fallback_1" },
    ];
    const a = fallbackAlbum("u1", existing);
    expect(a.id).toBe("alb_u1_fallback_2");
  });
});
