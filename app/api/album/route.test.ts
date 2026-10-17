/**
 * app/api/album/route 单测
 * ------------------------------------------------------------------
 * 重点覆盖 PUT 合并逻辑的两个回归：
 *
 * 1. viewer 写盘不丢 admin 的 album —— 旧实现 `keptAlbums` 会把 incomingAlbums
 *    里出现的他人 album 一并排除，导致 viewer 一 PUT 就 400 album_not_found。
 * 2. viewer 写盘只动自己的 album/photo —— 别人 album 不被偷偷改/删。
 *
 * Mock 策略：
 *   - @/lib/signer/auth：requireAuth 直接返 viewer user（跳过 cookie 验签）
 *   - @/lib/signer/users：findById 兜底（auth mock 后实际不会被调）
 *   - @/lib/signer/cos：getText/putText 走内存 map
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Manifest, PublicUser } from "@/lib/contracts";

vi.hoisted(() => {
  process.env.COS_BUCKET = "test-bucket";
  process.env.COS_REGION = "test-region";
  process.env.COS_SECRET_ID = "test-id";
  process.env.COS_SECRET_KEY = "test-key";
  process.env.SESSION_SECRET = "test-secret-test-secret-test";
});

let store: { body: string | null } = { body: null };

vi.mock("@/lib/signer/cos", () => ({
  getText: vi.fn(async () => store.body),
  putText: vi.fn(async (_key: string, body: string) => {
    store.body = body;
  }),
}));

const VIEWER: PublicUser = {
  id: "u_viewer",
  username: "viewer",
  displayName: "viewer",
  role: "viewer",
  disabled: false,
  sessionVersion: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
};

vi.mock("@/lib/signer/auth", () => ({
  requireAuth: vi.fn(() => VIEWER),
  readCookie: vi.fn(() => undefined),
  sessionCookieName: vi.fn(() => "album_session"),
  verifySession: vi.fn(() => null),
  issueSession: vi.fn(() => ""),
}));

vi.mock("@/lib/signer/users", () => ({
  findById: vi.fn(() => undefined),
  recordSecurityEvent: vi.fn(() => undefined),
}));

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

const mkReq = (body: unknown): unknown => {
  // 用一个最小 Request 替身；route.ts 只用 req.json() + req.headers.get (auth mock 接管)
  return {
    json: async () => body,
    headers: new Headers(),
    cookies: { get: () => undefined },
  } as unknown as import("next/server").NextRequest;
};

beforeEach(() => {
  store.body = null;
});

describe("PUT /api/album 合并逻辑", () => {
  it("回归：viewer 写盘不丢 admin 的 album（之前 viewer 一 PUT 就 400 album_not_found）", async () => {
    const adminAlbum = {
      id: "alb_admin_pub_1",
      slug: "pub",
      name: "公开相册",
      desc: "",
      coverKey: null,
      order: 1,
      ownerId: "u_admin",
    };
    const adminPhoto = {
      id: "ph_admin1",
      key: "image/admin/a.jpg",
      albumId: "alb_admin_pub_1",
      ownerId: "u_admin",
      isPublic: true,
      title: "",
      caption: "",
      place: "",
      shotAt: "2026-01-01",
      width: 1,
      height: 1,
      bytes: 1,
      trashedAt: null,
    };
    await writeStore(
      seedManifest({
        revision: 7,
        albums: [adminAlbum],
        photos: [adminPhoto],
      }),
    );

    // viewer 通过 visibleTo 拿到 admin 的公开相册 album（这就是"别人 album 出现在 incomingAlbums"）
    const viewerAlbum = {
      id: "alb_u_viewer_default_1",
      slug: "default",
      name: "默认相册",
      desc: "",
      coverKey: null,
      order: 1,
      ownerId: VIEWER.id,
    };
    const req = mkReq({
      revision: 7,
      albums: [adminAlbum, viewerAlbum],
      photos: [],
    });

    const { PUT } = await import("./route");
    const res = await PUT(req as import("next/server").NextRequest);
    expect(res.status).toBe(200);

    // 校验写回的 manifest：admin 的 album 仍在，admin 的 photo 引用完好
    const written = JSON.parse(store.body!) as Manifest;
    expect(written.albums.find((a) => a.id === adminAlbum.id)).toBeDefined();
    expect(written.albums.find((a) => a.id === viewerAlbum.id)).toBeDefined();
    expect(written.photos.find((p) => p.id === adminPhoto.id)?.albumId).toBe(
      adminAlbum.id,
    );
    expect(written.revision).toBe(8);
  });

  it("viewer 改自己 album 名称生效", async () => {
    const myAlbum = {
      id: "alb_u_viewer_x_1",
      slug: "x",
      name: "原名",
      desc: "",
      coverKey: null,
      order: 1,
      ownerId: VIEWER.id,
    };
    await writeStore(
      seedManifest({
        revision: 1,
        albums: [myAlbum],
        photos: [],
      }),
    );

    const req = mkReq({
      revision: 1,
      albums: [{ ...myAlbum, name: "新名" }],
      photos: [],
    });

    const { PUT } = await import("./route");
    const res = await PUT(req as import("next/server").NextRequest);
    expect(res.status).toBe(200);

    const written = JSON.parse(store.body!) as Manifest;
    const got = written.albums.find((a) => a.id === myAlbum.id);
    expect(got?.name).toBe("新名");
  });

  it("viewer 加新 album 写入", async () => {
    await writeStore(
      seedManifest({
        revision: 1,
        albums: [],
        photos: [],
      }),
    );

    const newAlbum = {
      id: "alb_u_viewer_trip_1",
      slug: "trip",
      name: "出差",
      desc: "",
      coverKey: null,
      order: 1,
      ownerId: VIEWER.id,
    };
    const req = mkReq({
      revision: 1,
      albums: [newAlbum],
      photos: [],
    });

    const { PUT } = await import("./route");
    const res = await PUT(req as import("next/server").NextRequest);
    expect(res.status).toBe(200);

    const written = JSON.parse(store.body!) as Manifest;
    expect(written.albums.find((a) => a.id === newAlbum.id)).toBeDefined();
  });

  it("viewer 想删自己 album：从 incomingAlbums 里去掉该 album 即可生效（被 mineAlbum 决定）", async () => {
    const oldAlbum = {
      id: "alb_u_viewer_x_1",
      slug: "x",
      name: "要删",
      desc: "",
      coverKey: null,
      order: 1,
      ownerId: VIEWER.id,
    };
    const newAlbum = {
      id: "alb_u_viewer_y_1",
      slug: "y",
      name: "新加",
      desc: "",
      coverKey: null,
      order: 2,
      ownerId: VIEWER.id,
    };
    await writeStore(
      seedManifest({
        revision: 1,
        albums: [oldAlbum, newAlbum],
        photos: [],
      }),
    );

    const req = mkReq({
      revision: 1,
      albums: [newAlbum], // 不带 oldAlbum = 删
      photos: [],
    });

    const { PUT } = await import("./route");
    const res = await PUT(req as import("next/server").NextRequest);
    expect(res.status).toBe(200);

    const written = JSON.parse(store.body!) as Manifest;
    expect(written.albums.find((a) => a.id === oldAlbum.id)).toBeUndefined();
    expect(written.albums.find((a) => a.id === newAlbum.id)).toBeDefined();
  });

  it("viewer 想改 admin album 的 name：被忽略（mineAlbum 兜底）", async () => {
    const adminAlbum = {
      id: "alb_admin_pub_1",
      slug: "pub",
      name: "原名",
      desc: "",
      coverKey: null,
      order: 1,
      ownerId: "u_admin",
    };
    await writeStore(
      seedManifest({
        revision: 1,
        albums: [adminAlbum],
        photos: [],
      }),
    );

    const req = mkReq({
      revision: 1,
      albums: [{ ...adminAlbum, name: "被改" }],
      photos: [],
    });

    const { PUT } = await import("./route");
    const res = await PUT(req as import("next/server").NextRequest);
    expect(res.status).toBe(200);

    const written = JSON.parse(store.body!) as Manifest;
    const got = written.albums.find((a) => a.id === adminAlbum.id);
    expect(got?.name).toBe("原名");
  });

  it("dangling 仍能拒：viewer 想把 photo 挂到不存在的 album", async () => {
    const myPhoto = {
      id: "ph_me_1",
      key: "image/u_viewer/a.jpg",
      albumId: "alb_u_viewer_default_1",
      ownerId: VIEWER.id,
      isPublic: false,
      title: "",
      caption: "",
      place: "",
      shotAt: "2026-01-01",
      width: 1,
      height: 1,
      bytes: 1,
      trashedAt: null,
    };
    await writeStore(
      seedManifest({
        revision: 1,
        albums: [
          {
            id: "alb_u_viewer_default_1",
            slug: "default",
            name: "默认相册",
            desc: "",
            coverKey: null,
            order: 1,
            ownerId: VIEWER.id,
          },
        ],
        photos: [myPhoto],
      }),
    );

    const req = mkReq({
      revision: 1,
      albums: [],
      photos: [{ ...myPhoto, albumId: "alb_nope_1" }],
    });

    const { PUT } = await import("./route");
    const res = await PUT(req as import("next/server").NextRequest);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("album_not_found");
  });
});