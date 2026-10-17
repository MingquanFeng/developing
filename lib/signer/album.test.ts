/**
 * lib/signer/album 单测
 * ------------------------------------------------------------------
 * Mock COS 的 getText/putText 走内存 map，不真写对象存储。
 *
 * 必须先把 COS/SESSION_SECRET 环境变量塞上，否则 lib/signer/config.ts
 * 顶层 must() 会抛 —— 用 vi.hoisted 提前在模块加载前设置。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Manifest } from "@/lib/contracts";

vi.hoisted(() => {
  process.env.COS_BUCKET = "test-bucket";
  process.env.COS_REGION = "test-region";
  process.env.COS_SECRET_ID = "test-id";
  process.env.COS_SECRET_KEY = "test-key";
  process.env.SESSION_SECRET = "test-secret-test-secret-test";
});

// 用模块级变量持有内存 manifest，mock 里读 / 写它
let store: { body: string | null } = { body: null };

vi.mock("@/lib/signer/cos", () => ({
  getText: vi.fn(async () => store.body),
  putText: vi.fn(async (_key: string, body: string) => {
    store.body = body;
  }),
}));

// readManifest 在模块加载时不会触发副作用，import 在测试代码里安全
import { deleteAlbum, ensureDefaultAlbum, readManifest, visibleTo } from "@/lib/signer/album";
import { defaultAlbum as makeDefault } from "@/lib/album-id";

const seedManifest = (extra: Partial<Manifest> = {}): Manifest => ({
  revision: 1,
  updatedAt: "2026-01-01T00:00:00.000Z",
  albums: [],
  photos: [],
  ...extra,
});

const writeStore = async (m: Manifest) => {
  store.body = JSON.stringify(m);
};

beforeEach(() => {
  store.body = null;
});

describe("ensureDefaultAlbum（重写后）", () => {
  it("已有 photo → 不重建", async () => {
    await writeStore(
      seedManifest({
        photos: [
          {
            id: "p1",
            key: "image/u1/2026/01/a.jpg",
            albumId: "alb_u1_x_1",
            ownerId: "u1",
            isPublic: true,
            title: "",
            caption: "",
            place: "",
            shotAt: "2026-01-01",
            width: 1,
            height: 1,
            bytes: 1,
            trashedAt: null,
          },
        ],
      }),
    );

    const m = await ensureDefaultAlbum("u1");
    expect(m.albums.length).toBe(0);
  });

  it("已有 album → 不重建", async () => {
    const album = makeDefault("u1");
    await writeStore(seedManifest({ albums: [album] }));

    const m = await ensureDefaultAlbum("u1");
    expect(m.albums.length).toBe(1);
    expect(m.albums[0].id).toBe(album.id);
  });

  it("空 manifest + 无 photo → 重建 defaultAlbum（id 走新工具）", async () => {
    await writeStore(seedManifest());

    const m = await ensureDefaultAlbum("u1");
    expect(m.albums.length).toBe(1);
    expect(m.albums[0].id).toBe("alb_u1_default_1");
    expect(m.albums[0].slug).toBe("default");
  });
});

describe("deleteAlbum", () => {
  it("happy path：删非空相册 → 非回收站照片迁 fallback → 回收站不动", async () => {
    const targetAlbum = {
      id: "alb_u1_target_1",
      slug: "trip",
      name: "出差",
      desc: "",
      coverKey: null,
      order: 1,
      ownerId: "u1",
    };
    const otherAlbum = {
      id: "alb_u1_other_1",
      slug: "daily",
      name: "日常",
      desc: "",
      coverKey: null,
      order: 2,
      ownerId: "u1",
    };
    await writeStore(
      seedManifest({
        revision: 5,
        albums: [targetAlbum, otherAlbum],
        photos: [
          {
            id: "p_live1",
            key: "image/u1/2026/01/a.jpg",
            albumId: "alb_u1_target_1",
            ownerId: "u1",
            isPublic: false,
            title: "",
            caption: "",
            place: "",
            shotAt: "2026-01-01",
            width: 1,
            height: 1,
            bytes: 1,
            trashedAt: null,
          },
          {
            id: "p_live2",
            key: "image/u1/2026/01/b.jpg",
            albumId: "alb_u1_target_1",
            ownerId: "u1",
            isPublic: true,
            title: "",
            caption: "",
            place: "",
            shotAt: "2026-01-02",
            width: 1,
            height: 1,
            bytes: 1,
            trashedAt: null,
          },
          {
            id: "p_trashed",
            key: "image/u1/2026/01/c.jpg",
            albumId: "alb_u1_target_1",
            ownerId: "u1",
            isPublic: true,
            title: "",
            caption: "",
            place: "",
            shotAt: "2026-01-03",
            width: 1,
            height: 1,
            bytes: 1,
            trashedAt: "2026-02-01T00:00:00.000Z",
          },
          {
            id: "p_other",
            key: "image/u1/2026/01/d.jpg",
            albumId: "alb_u1_other_1",
            ownerId: "u1",
            isPublic: true,
            title: "",
            caption: "",
            place: "",
            shotAt: "2026-01-04",
            width: 1,
            height: 1,
            bytes: 1,
            trashedAt: null,
          },
        ],
      }),
    );

    const r = await deleteAlbum("alb_u1_target_1", "u1", 5);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    // 1) target album 没了
    expect(r.manifest.albums.find((a) => a.id === "alb_u1_target_1")).toBeUndefined();
    // 2) fallback 自动创建，slug=fallback order=999
    const fb = r.manifest.albums.find((a) => a.slug === "fallback");
    expect(fb).toBeDefined();
    expect(fb?.id).toBe("alb_u1_fallback_1");
    // 3) 两张非回收站照片 → albumId 改成 fallback
    const live1 = r.manifest.photos.find((p) => p.id === "p_live1");
    const live2 = r.manifest.photos.find((p) => p.id === "p_live2");
    expect(live1?.albumId).toBe("alb_u1_fallback_1");
    expect(live2?.albumId).toBe("alb_u1_fallback_1");
    // 4) 回收站照片不动
    const trashed = r.manifest.photos.find((p) => p.id === "p_trashed");
    expect(trashed?.albumId).toBe("alb_u1_target_1");
    // 5) 其它相册不动
    const other = r.manifest.albums.find((a) => a.id === "alb_u1_other_1");
    expect(other).toBeDefined();
    const otherPhoto = r.manifest.photos.find((p) => p.id === "p_other");
    expect(otherPhoto?.albumId).toBe("alb_u1_other_1");
    // 6) revision +1
    expect(r.manifest.revision).toBe(6);
  });

  it("happy path：fallback 已存在 → 复用，不重建", async () => {
    const target = {
      id: "alb_u1_x_1",
      slug: "x",
      name: "x",
      desc: "",
      coverKey: null,
      order: 1,
      ownerId: "u1",
    };
    const existingFb = {
      id: "alb_u1_fallback_99",
      slug: "fallback",
      name: "回收相册",
      desc: "",
      coverKey: null,
      order: 999,
      ownerId: "u1",
    };
    await writeStore(
      seedManifest({
        revision: 3,
        albums: [target, existingFb],
        photos: [],
      }),
    );

    const r = await deleteAlbum("alb_u1_x_1", "u1", 3);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.manifest.albums.length).toBe(1);
    expect(r.manifest.albums[0].id).toBe("alb_u1_fallback_99");
  });

  it("not_found：albumId 不存在", async () => {
    await writeStore(seedManifest({ revision: 1, albums: [] }));

    const r = await deleteAlbum("alb_nope_1", "u1", 1);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe("not_found");
  });

  it("forbidden：删别人 ownerId 的 album", async () => {
    await writeStore(
      seedManifest({
        revision: 2,
        albums: [
          {
            id: "alb_u2_x_1",
            slug: "x",
            name: "x",
            desc: "",
            coverKey: null,
            order: 1,
            ownerId: "u2",
          },
        ],
      }),
    );

    const r = await deleteAlbum("alb_u2_x_1", "u1", 2);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe("forbidden");
    // 服务端 revision 不变
    expect((await readManifest()).revision).toBe(2);
  });

  it("stale_revision：currentRevision 与服务端不一致", async () => {
    await writeStore(
      seedManifest({
        revision: 5,
        albums: [
          {
            id: "alb_u1_x_1",
            slug: "x",
            name: "x",
            desc: "",
            coverKey: null,
            order: 1,
            ownerId: "u1",
          },
        ],
      }),
    );

    const r = await deleteAlbum("alb_u1_x_1", "u1", 99);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe("stale_revision");
    expect(r.current?.revision).toBe(5);
  });
});

describe("visibleTo 相册过滤", () => {
  it("viewer 看到自己名下 0 张照片的空相册（关键回归：建了必须能看到）", () => {
    const myEmpty = makeDefault("u1"); // id=alb_u1_default_1, 0 photos
    const m = seedManifest({ albums: [myEmpty], photos: [] });

    const got = visibleTo(m, "u1");
    expect(got.albums.find((a) => a.id === myEmpty.id)).toBeDefined();
  });

  it("访客（viewerId=null）看不到他人空相册", () => {
    const othersEmpty = {
      id: "alb_u2_x_1",
      slug: "x",
      name: "x",
      desc: "",
      coverKey: null,
      order: 1,
      ownerId: "u2",
    };
    const m = seedManifest({ albums: [othersEmpty], photos: [] });

    const got = visibleTo(m, null);
    expect(got.albums.find((a) => a.id === othersEmpty.id)).toBeUndefined();
  });

  it("访客看到他人相册内有公开照片的非空相册", () => {
    const pub = {
      id: "alb_u2_pub_1",
      slug: "pub",
      name: "公开相册",
      desc: "",
      coverKey: null,
      order: 1,
      ownerId: "u2",
    };
    const m = seedManifest({
      albums: [pub],
      photos: [
        {
          id: "p1",
          key: "image/u2/a.jpg",
          albumId: pub.id,
          ownerId: "u2",
          isPublic: true,
          title: "",
          caption: "",
          place: "",
          shotAt: "2026-01-01",
          width: 1,
          height: 1,
          bytes: 1,
          trashedAt: null,
        },
      ],
    });

    const got = visibleTo(m, null);
    expect(got.albums.find((a) => a.id === pub.id)).toBeDefined();
    expect(got.photos.find((p) => p.id === "p1")).toBeDefined();
  });

  it("viewer 看到他人非空公开相册 + 自己所有相册（含空）", () => {
    const pub = {
      id: "alb_u2_pub_1",
      slug: "pub",
      name: "公开相册",
      desc: "",
      coverKey: null,
      order: 1,
      ownerId: "u2",
    };
    const myEmpty = makeDefault("u1");
    const m = seedManifest({
      albums: [pub, myEmpty],
      photos: [
        {
          id: "p_pub",
          key: "image/u2/a.jpg",
          albumId: pub.id,
          ownerId: "u2",
          isPublic: true,
          title: "",
          caption: "",
          place: "",
          shotAt: "2026-01-01",
          width: 1,
          height: 1,
          bytes: 1,
          trashedAt: null,
        },
      ],
    });

    const got = visibleTo(m, "u1");
    // 自己空相册
    expect(got.albums.find((a) => a.id === myEmpty.id)).toBeDefined();
    // 他人有公开照片的相册
    expect(got.albums.find((a) => a.id === pub.id)).toBeDefined();
    // 公开照片
    expect(got.photos.find((p) => p.id === "p_pub")).toBeDefined();
  });
});
