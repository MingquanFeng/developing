/**
 * /api/site/content/[key] 与 /api/site/content/versions 的路由单测
 * ------------------------------------------------------------------
 * 重点覆盖两件容易出错的事：
 *
 * 1. **权限闸门**：PUT / DELETE / GET versions 三个端点都必须过
 *    requireAdmin。漏掉一个 = 把内容改写权/内部历史送出去。
 * 2. **走版本流**：发布与重置都要落一条版本；重置还要删掉
 *    site_content 的运行时覆盖行（读取回落静态默认）。
 *
 * Mock 策略（照抄 app/api/album/route.test.ts）：
 *   - @/lib/signer/auth：requireAuth 直接返当前用户（跳过 cookie 验签）
 *   - @/lib/signer/users：recordSecurityEvent 吞掉（不写审计表）
 *   - next/cache：revalidatePath 吞掉（没有请求上下文）
 *   - 持久层不 mock —— 真 SQLite（临时文件），验证的是真约束
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import type { PublicUser } from "@/lib/contracts";

vi.hoisted(() => {
  /* 必须在 import 持久层之前设 —— _db.ts 加载时读 env 决定 DB 路径 */
  process.env.USERS_DB_PATH = `${process.env.TMPDIR ?? "/tmp"}/site-content-route-test-${process.pid}-${Date.now()}.db`;
  process.env.COS_BUCKET = "test-bucket";
  process.env.COS_REGION = "test-region";
  process.env.COS_SECRET_ID = "test-id";
  process.env.COS_SECRET_KEY = "test-key";
  process.env.SESSION_SECRET = "test-secret-test-secret-test";
});

const h = vi.hoisted(() => ({
  user: {
    id: "u_admin",
    username: "admin",
    displayName: "admin",
    role: "admin",
    disabled: false,
    sessionVersion: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
  } as PublicUser,
}));

vi.mock("@/lib/signer/auth", async () => {
  const { NextResponse } = await import("next/server");
  return {
    requireAuth: vi.fn(() => h.user),
    requireAdmin: vi.fn((u: PublicUser) =>
      u.role === "admin"
        ? null
        : NextResponse.json({ error: "forbidden", role: u.role }, { status: 403 }),
    ),
    clientIp: vi.fn(() => "127.0.0.1"),
  };
});

vi.mock("@/lib/signer/users", () => ({
  recordSecurityEvent: vi.fn(() => undefined),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(() => undefined),
}));

const { db } = await import("@/lib/signer/_db");
const {
  getSiteSection,
  listSiteContentVersions,
} = await import("@/lib/signer/site-content");

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

/** route.ts 只用 req.json() / req.headers / req.nextUrl —— 最小替身够了 */
const mkReq = (
  body?: unknown,
  query = "",
): import("next/server").NextRequest =>
  ({
    json: async () => body,
    headers: new Headers(),
    nextUrl: { searchParams: new URLSearchParams(query) },
  }) as unknown as import("next/server").NextRequest;

const paramsOf = (key: string) => ({ params: Promise.resolve({ key }) });

afterAll(() => {
  const p = process.env.USERS_DB_PATH;
  if (!p) return;
  for (const suffix of ["", "-shm", "-wal"]) {
    try {
      fs.unlinkSync(p + suffix);
    } catch {
      /* 文件不存在就算了 */
    }
  }
});

beforeEach(() => {
  db.exec("DELETE FROM site_content_versions");
  db.exec("DELETE FROM site_content");
  h.user = { ...h.user, role: "admin" };
});

/* ============================================================
   PUT —— 发布
   ============================================================ */

describe("PUT /api/site/content/[key]", () => {
  it("admin 发布 → 200，返回 key/updatedAt/versionId 并落一条版本", async () => {
    const { PUT } = await import("./route");
    const res = await PUT(
      mkReq({ content: VALID_HERO }),
      paramsOf("hero"),
    );
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      key: string;
      updatedAt: string;
      versionId: number;
    };
    expect(body.key).toBe("hero");
    expect(typeof body.updatedAt).toBe("string");
    expect(typeof body.versionId).toBe("number");

    const versions = listSiteContentVersions("hero");
    expect(versions).toHaveLength(1);
    expect(versions[0].id).toBe(body.versionId);
    expect(versions[0].createdBy).toBe("u_admin");
    expect(versions[0].isCurrent).toBe(true);
    expect(getSiteSection("hero")).toEqual(VALID_HERO);
  });

  it("viewer 发布 → 403（不能把内容改写权漏出去）", async () => {
    h.user = { ...h.user, role: "viewer" };
    const { PUT } = await import("./route");
    const res = await PUT(mkReq({ content: VALID_HERO }), paramsOf("hero"));
    expect(res.status).toBe(403);
    expect(listSiteContentVersions("hero")).toHaveLength(0);
  });

  it("不认识的 key → 400 invalid_section_key", async () => {
    const { PUT } = await import("./route");
    const res = await PUT(mkReq({ content: VALID_HERO }), paramsOf("nope"));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe(
      "invalid_section_key",
    );
  });

  it("内容形状非法 → 400 invalid_section_shape，不落版本", async () => {
    const { PUT } = await import("./route");
    const res = await PUT(
      mkReq({ content: { tags: "错" } }),
      paramsOf("hero"),
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe(
      "invalid_section_shape",
    );
    expect(listSiteContentVersions("hero")).toHaveLength(0);
  });

  it("basedOnId 不是正整数 → 400 bad_request", async () => {
    const { PUT } = await import("./route");
    const res = await PUT(
      mkReq({ content: VALID_HERO, basedOnId: "abc" }),
      paramsOf("hero"),
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("bad_request");
  });

  it("basedOnId 串进版本链", async () => {
    const { PUT } = await import("./route");
    const first = (await (
      await PUT(mkReq({ content: VALID_HERO }), paramsOf("hero"))
    ).json()) as { versionId: number };
    const second = (await (
      await PUT(
        mkReq({ content: { ...VALID_HERO, titleLines: ["新", "版"] }, basedOnId: first.versionId }),
        paramsOf("hero"),
      )
    ).json()) as { versionId: number };

    const versions = listSiteContentVersions("hero");
    expect(versions).toHaveLength(2);
    expect(versions[0].id).toBe(second.versionId);
    expect(versions[0].basedOnId).toBe(first.versionId);
  });
});

/* ============================================================
   DELETE —— 重置
   ============================================================ */

describe("DELETE /api/site/content/[key]", () => {
  it("admin 重置 → 200，返回 reset/versionId，删掉覆盖行并落一条版本", async () => {
    const { PUT, DELETE } = await import("./route");
    await PUT(mkReq({ content: VALID_HERO }), paramsOf("hero"));

    const res = await DELETE(mkReq(), paramsOf("hero"));
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      key: string;
      reset: boolean;
      versionId: number;
    };
    expect(body.key).toBe("hero");
    expect(body.reset).toBe(true);
    expect(typeof body.versionId).toBe("number");

    /* 覆盖行没了 → 读取回落静态默认 */
    expect(getSiteSection("hero")).toBeNull();

    const versions = listSiteContentVersions("hero");
    expect(versions).toHaveLength(2);
    expect(versions[0].id).toBe(body.versionId);
    expect(versions[0].isCurrent).toBe(true);
  });

  it("viewer 重置 → 403", async () => {
    h.user = { ...h.user, role: "viewer" };
    const { DELETE } = await import("./route");
    const res = await DELETE(mkReq(), paramsOf("hero"));
    expect(res.status).toBe(403);
  });
});

/* ============================================================
   GET versions
   ============================================================ */

describe("GET /api/site/content/versions", () => {
  it("admin → 返回版本列表", async () => {
    const { PUT } = await import("./route");
    await PUT(mkReq({ content: VALID_HERO }), paramsOf("hero"));

    const { GET } = await import("../versions/route");
    const res = await GET(mkReq(undefined, "key=hero"));
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      versions: { id: number; key: string; isCurrent: boolean }[];
    };
    expect(body.versions).toHaveLength(1);
    expect(body.versions[0].key).toBe("hero");
    expect(body.versions[0].isCurrent).toBe(true);
  });

  it("admin 不带 key → 返回全部 key 的版本", async () => {
    const { PUT } = await import("./route");
    await PUT(mkReq({ content: VALID_HERO }), paramsOf("hero"));

    const { GET } = await import("../versions/route");
    const res = await GET(mkReq());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { versions: unknown[] };
    expect(body.versions.length).toBeGreaterThanOrEqual(1);
  });

  it("key 不合法 → 400 invalid_section_key", async () => {
    const { GET } = await import("../versions/route");
    const res = await GET(mkReq(undefined, "key=nope"));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe(
      "invalid_section_key",
    );
  });

  it("viewer → 403（版本里有 admin userId，属内部信息）", async () => {
    h.user = { ...h.user, role: "viewer" };
    const { GET } = await import("../versions/route");
    const res = await GET(mkReq());
    expect(res.status).toBe(403);
  });
});
