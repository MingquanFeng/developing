/**
 * lib/site-images 单测
 * ------------------------------------------------------------------
 * 用 stub 注入 manifest 与 presignGet —— 不依赖真 COS，也不碰 node:sqlite。
 *
 * 关注三件事：
 *   1. 命中时 photoId 覆盖兜底图
 *   2. 各种异常（不存在 / 私有 / 回收站 / 签名失败 / 清单读不出）
 *      一律静默保留原值 —— 首屏永远不白
 *   3. alt 的填充规则（单图位 vs series 不一样，见 lib/site-images.ts）
 *
 * ⚠️ 必须先把 COS/SESSION_SECRET 环境变量塞上，否则 lib/signer/config.ts
 *    顶层 must() 会抛 —— 用 vi.hoisted 提前在模块加载前设置。
 * ⚠️ "server-only" 在 Node 环境里会抛（它只在 react-server 条件下是空模块），
 *    这里 mock 成空对象，绕开 webpack 之外的运行时守门。
 */
import { describe, expect, it, vi } from "vitest";
import type { Manifest, Photo } from "@/lib/contracts";

vi.hoisted(() => {
  process.env.COS_BUCKET = "test-bucket";
  process.env.COS_REGION = "test-region";
  process.env.COS_SECRET_ID = "test-id";
  process.env.COS_SECRET_KEY = "test-key";
  process.env.SESSION_SECRET = "test-secret-test-secret-test";
});

vi.mock("server-only", () => ({}));

import {
  pickPublicPhoto,
  resolveHomeImages,
  resolveImageSlot,
  resolvePhoto,
  resolveSeriesSlots,
  type SiteImagesDeps,
} from "@/lib/site-images";

/* ---------- 素材 ---------- */

const photo = (over: Partial<Photo> = {}): Photo => ({
  id: "p1",
  key: "image/u1/2026/01/a.jpg",
  albumId: "alb_u1_x_1",
  ownerId: "u1",
  isPublic: true,
  title: "对象 01",
  caption: "",
  place: "",
  shotAt: "2026-01-01",
  width: 1200,
  height: 800,
  bytes: 1024,
  trashedAt: null,
  ...over,
});

const manifestOf = (photos: Photo[]): Manifest => ({
  revision: 1,
  updatedAt: "2026-01-01T00:00:00.000Z",
  albums: [],
  photos,
});

/** 注入 stub：清单与签名都不碰真环境 */
const depsOf = (
  photos: Photo[],
  sign: (key: string) => Promise<string> = async (key) =>
    `https://cos.example/${key}?sig=1`,
): SiteImagesDeps => ({
  readManifest: async () => manifestOf(photos),
  presignGet: sign,
});

/* ============================================================
   pickPublicPhoto
   ============================================================ */

describe("pickPublicPhoto", () => {
  it("公开且非回收站 → 命中", () => {
    const m = manifestOf([photo()]);
    expect(pickPublicPhoto(m, "p1")?.id).toBe("p1");
  });

  it("不存在 → undefined", () => {
    expect(pickPublicPhoto(manifestOf([photo()]), "nope")).toBeUndefined();
  });

  it("私有照片 → undefined", () => {
    const m = manifestOf([photo({ isPublic: false })]);
    expect(pickPublicPhoto(m, "p1")).toBeUndefined();
  });

  it("回收站里的照片 → undefined", () => {
    const m = manifestOf([photo({ trashedAt: "2026-02-01T00:00:00.000Z" })]);
    expect(pickPublicPhoto(m, "p1")).toBeUndefined();
  });
});

/* ============================================================
   resolvePhoto
   ============================================================ */

describe("resolvePhoto", () => {
  it("命中 → 返回签名 URL + 照片元信息", async () => {
    const r = await resolvePhoto("p1", depsOf([photo()]));
    expect(r?.url).toBe("https://cos.example/image/u1/2026/01/a.jpg?sig=1");
    expect(r?.photo.title).toBe("对象 01");
  });

  it("photoId 为 null → null（不读清单）", async () => {
    const readManifest = vi.fn(async () => manifestOf([photo()]));
    const r = await resolvePhoto(null, { readManifest });
    expect(r).toBeNull();
    expect(readManifest).not.toHaveBeenCalled();
  });

  it("照片不存在 → null", async () => {
    expect(await resolvePhoto("nope", depsOf([photo()]))).toBeNull();
  });

  it("私有照片 → null", async () => {
    expect(
      await resolvePhoto("p1", depsOf([photo({ isPublic: false })])),
    ).toBeNull();
  });

  it("回收站里的照片 → null", async () => {
    expect(
      await resolvePhoto(
        "p1",
        depsOf([photo({ trashedAt: "2026-02-01T00:00:00.000Z" })]),
      ),
    ).toBeNull();
  });

  it("签名失败 → null（不抛错）", async () => {
    const r = await resolvePhoto(
      "p1",
      depsOf([photo()], async () => {
        throw new Error("COS 挂了");
      }),
    );
    expect(r).toBeNull();
  });

  it("清单读不出 → null（不抛错）", async () => {
    const r = await resolvePhoto("p1", {
      readManifest: async () => {
        throw new Error("sqlite 锁了");
      },
      presignGet: async () => "https://cos.example/x",
    });
    expect(r).toBeNull();
  });
});

/* ============================================================
   resolveImageSlot（hero / story）
   ============================================================ */

describe("resolveImageSlot", () => {
  const slot = {
    image: "https://fallback.example/a.jpg",
    imageAlt: "",
    photoId: "p1" as string | null,
  };

  it("命中 → image 换成签名 URL", async () => {
    const out = await resolveImageSlot(slot, depsOf([photo()]));
    expect(out.image).toBe("https://cos.example/image/u1/2026/01/a.jpg?sig=1");
  });

  it("alt 为空 → 用照片标题补上", async () => {
    const out = await resolveImageSlot(slot, depsOf([photo()]));
    expect(out.imageAlt).toBe("对象 01");
  });

  it("alt 已填 → 原样保留（用户手写的不被盖掉）", async () => {
    const out = await resolveImageSlot(
      { ...slot, imageAlt: "手写的 alt" },
      depsOf([photo()]),
    );
    expect(out.imageAlt).toBe("手写的 alt");
  });

  it("photoId 为 null → 原样返回（连对象都不新建）", async () => {
    const out = await resolveImageSlot({ ...slot, photoId: null }, depsOf([photo()]));
    expect(out.image).toBe("https://fallback.example/a.jpg");
    expect(out.imageAlt).toBe("");
  });

  it("私有照片 → 保留兜底图", async () => {
    const out = await resolveImageSlot(slot, depsOf([photo({ isPublic: false })]));
    expect(out.image).toBe("https://fallback.example/a.jpg");
  });

  it("回收站里的照片 → 保留兜底图", async () => {
    const out = await resolveImageSlot(
      slot,
      depsOf([photo({ trashedAt: "2026-02-01T00:00:00.000Z" })]),
    );
    expect(out.image).toBe("https://fallback.example/a.jpg");
  });

  it("签名失败 → 保留兜底图", async () => {
    const out = await resolveImageSlot(
      slot,
      depsOf([photo()], async () => {
        throw new Error("COS 挂了");
      }),
    );
    expect(out.image).toBe("https://fallback.example/a.jpg");
  });
});

/* ============================================================
   resolveSeriesSlots
   ============================================================ */

describe("resolveSeriesSlots", () => {
  const items = [
    {
      image: "https://fallback.example/1.jpg",
      imageAlt: "上海 03:17 — 对象 01",
      photoId: "p1" as string | null,
    },
    {
      image: "https://fallback.example/2.jpg",
      imageAlt: "北京素描 — 对象 02",
      photoId: null as string | null,
    },
  ];

  it("命中的那项换成签名 URL，没命中的原样保留", async () => {
    const out = await resolveSeriesSlots(items, depsOf([photo()]));
    expect(out[0].image).toBe("https://cos.example/image/u1/2026/01/a.jpg?sig=1");
    expect(out[1].image).toBe("https://fallback.example/2.jpg");
  });

  it("alt 用照片标题（与相册封面 enrichment 抢 alt 时，照片标题才是这张图的 alt）", async () => {
    const out = await resolveSeriesSlots(items, depsOf([photo()]));
    expect(out[0].imageAlt).toBe("对象 01");
  });

  it("照片没有标题 → 保留原 alt", async () => {
    const out = await resolveSeriesSlots(
      items,
      depsOf([photo({ title: "" })]),
    );
    expect(out[0].imageAlt).toBe("上海 03:17 — 对象 01");
  });
});

/* ============================================================
   resolveHomeImages
   ============================================================ */

describe("resolveHomeImages", () => {
  const home = {
    hero: {
      image: "https://fallback.example/hero.jpg",
      imageAlt: "",
      photoId: "p1" as string | null,
    },
    story: {
      image: "https://fallback.example/story.jpg",
      imageAlt: "",
      photoId: null as string | null,
    },
    about: {
      portrait: "https://fallback.example/about.jpg",
      portraitAlt: "",
      photoId: "p1" as string | null,
    },
    series: [
      {
        image: "https://fallback.example/s1.jpg",
        imageAlt: "系列 alt",
        photoId: "p1" as string | null,
      },
    ],
  };

  it("4 块一起处理，命中的换 URL、没命中的原样", async () => {
    const out = await resolveHomeImages(home, depsOf([photo()]));
    const url = "https://cos.example/image/u1/2026/01/a.jpg?sig=1";
    expect(out.hero.image).toBe(url);
    expect(out.story.image).toBe("https://fallback.example/story.jpg");
    expect(out.about.portrait).toBe(url);
    expect(out.series[0].image).toBe(url);
  });

  it("清单只读一次（4 块共用）", async () => {
    const readManifest = vi.fn(async () => manifestOf([photo()]));
    await resolveHomeImages(home, {
      readManifest,
      presignGet: async (key) => `https://cos.example/${key}`,
    });
    expect(readManifest).toHaveBeenCalledTimes(1);
  });

  it("同一个 photoId 只签一次", async () => {
    const presignGet = vi.fn(async (key: string) => `https://cos.example/${key}`);
    await resolveHomeImages(home, {
      readManifest: async () => manifestOf([photo()]),
      presignGet,
    });
    expect(presignGet).toHaveBeenCalledTimes(1);
  });

  it("清单读不出 → 4 块全部保留兜底图", async () => {
    const out = await resolveHomeImages(home, {
      readManifest: async () => {
        throw new Error("挂了");
      },
      presignGet: async () => "https://cos.example/x",
    });
    expect(out.hero.image).toBe("https://fallback.example/hero.jpg");
    expect(out.about.portrait).toBe("https://fallback.example/about.jpg");
    expect(out.series[0].image).toBe("https://fallback.example/s1.jpg");
  });
});
