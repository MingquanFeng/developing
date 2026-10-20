/**
 * 单节首页内容写入 / 重置
 * ------------------------------------------------------------------
 *   PUT    /api/site/content/[key]   body: { content: <section shape> }
 *                                    → 校验 + 写入 + 审计 + revalidatePath('/')
 *   DELETE /api/site/content/[key]
 *                                    → 删除该节运行时覆盖 → 回落到静态默认
 *
 * 两个端点都是 admin-only（requireAdmin 闸门）。
 *
 * 写-审-失效顺序：先 setSiteSection（DB 写），再 recordSecurityEvent
 * （独立 try/catch：审计失败 console.error 但返 200，绝不丢审计后
 * 还让用户看到 500）；最后 revalidatePath('/') 失效首页缓存。任一阶段
 * 失败都按"已落库部分不留半截"原则处理。
 */
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin, requireAuth, clientIp } from "@/lib/signer/auth";
import {
  resetSiteSection,
  setSiteSection,
} from "@/lib/signer/site-content";
import { recordSecurityEvent } from "@/lib/signer/users";
import type { SiteSectionKey } from "@/lib/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_KEYS: ReadonlySet<SiteSectionKey> = new Set([
  "hero",
  "about",
  "subscribe",
  "footer",
]);

function isValidKey(s: string): s is SiteSectionKey {
  if (s.length > 32) return false;
  return VALID_KEYS.has(s as SiteSectionKey);
}

/** PUT —— 写入单节内容 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const denied = requireAdmin(auth);
  if (denied) return denied;

  const { key } = await params;
  if (!isValidKey(key)) {
    return NextResponse.json(
      { error: "invalid_section_key", detail: "不支持的 section" },
      { status: 400 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    content?: unknown;
  };
  if (body.content === undefined) {
    return NextResponse.json(
      { error: "bad_request", detail: "body 需要 content 字段" },
      { status: 400 },
    );
  }

  let updatedAt: string;
  try {
    ({ updatedAt } = setSiteSection<unknown>(key, body.content, auth.id));
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "invalid_section_shape") {
      return NextResponse.json(
        {
          error: code,
          detail: "内容形状不符合该 section 的 schema",
        },
        { status: 400 },
      );
    }
    throw e;
  }

  /* 审计独立捕获：失败不阻塞用户成功反馈，仅打点。
     site_content_* 事件专用 actor_user_id 列；user_ref 列仍按 username
     语义，不与 site_content 写混合。 */
  try {
    recordSecurityEvent({
      kind: "site_content_write",
      userRef: null,
      actorUserId: auth.id,
      ip: clientIp(req),
      detail: { key },
    });
  } catch (e) {
    console.error("[site_content_write] 审计失败:", (e as Error).message);
  }

  revalidatePath("/");
  return NextResponse.json({ key, updatedAt });
}

/** DELETE —— 删除该节运行时覆盖（回落静态默认值） */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const denied = requireAdmin(auth);
  if (denied) return denied;

  const { key } = await params;
  if (!isValidKey(key)) {
    return NextResponse.json(
      { error: "invalid_section_key", detail: "不支持的 section" },
      { status: 400 },
    );
  }

  try {
    resetSiteSection(key);
  } catch (e) {
    /* 当前 resetSiteSection 不抛；保留 catch 防止未来加 not_found 检查时静默 500 */
    throw e;
  }

  try {
    recordSecurityEvent({
      kind: "site_content_reset",
      userRef: null,
      actorUserId: auth.id,
      ip: clientIp(req),
      detail: { key },
    });
  } catch (e) {
    console.error("[site_content_reset] 审计失败:", (e as Error).message);
  }

  revalidatePath("/");
  return NextResponse.json({ key, reset: true });
}