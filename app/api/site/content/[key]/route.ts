/**
 * 单节首页内容发布 / 重置
 * ------------------------------------------------------------------
 *   PUT    /api/site/content/[key]   body: { content: <section shape>, basedOnId?: number | null }
 *                                    → 校验 + 追加版本 + 写入 + 审计 + revalidatePath('/')
 *   DELETE /api/site/content/[key]
 *                                    → 追加「默认内容」版本 + 删除运行时覆盖 → 回落到静态默认
 *
 * 两个端点都是 admin-only（requireAdmin 闸门）。
 *
 * 写-审-失效顺序：先落库（publishSiteSection / resetSiteSectionToDefault），
 * 再 recordSecurityEvent（独立 try/catch：审计失败 console.error 但返 200，
 * 绝不丢审计后还让用户看到 500）；最后 revalidatePath('/') 失效首页缓存。
 * 任一阶段失败都按"已落库部分不留半截"原则处理。
 */
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin, requireAuth, clientIp } from "@/lib/signer/auth";
import {
  isSiteSectionKey,
  publishSiteSection,
  resetSiteSectionToDefault,
} from "@/lib/signer/site-content";
import { DEFAULT_SECTIONS } from "@/lib/data/site-content";
import { recordSecurityEvent } from "@/lib/signer/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * basedOnId 归一化 —— 新版本是从哪一版改下来的。
 *
 * 只接受正整数；其它（字符串、小数、负数、NaN）一律 400，不做静默
 * 兜底：版本链是给后台看的，链错了比没有链更难查。
 */
function parseBasedOnId(v: unknown): number | null | "invalid" {
  if (v === undefined || v === null) return null;
  if (typeof v !== "number" || !Number.isInteger(v) || v <= 0) return "invalid";
  return v;
}

/** PUT —— 发布一节内容（走版本流） */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const denied = requireAdmin(auth);
  if (denied) return denied;

  const { key } = await params;
  if (!isSiteSectionKey(key)) {
    return NextResponse.json(
      { error: "invalid_section_key", detail: "不支持的 section" },
      { status: 400 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    content?: unknown;
    basedOnId?: unknown;
  };
  if (body.content === undefined) {
    return NextResponse.json(
      { error: "bad_request", detail: "body 需要 content 字段" },
      { status: 400 },
    );
  }

  const basedOnId = parseBasedOnId(body.basedOnId);
  if (basedOnId === "invalid") {
    return NextResponse.json(
      { error: "bad_request", detail: "basedOnId 必须是正整数" },
      { status: 400 },
    );
  }

  let updatedAt: string;
  let versionId: number;
  try {
    ({ updatedAt, versionId } = publishSiteSection(
      key,
      body.content,
      auth.id,
      basedOnId,
    ));
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
      detail: { key, versionId },
    });
  } catch (e) {
    console.error("[site_content_write] 审计失败:", (e as Error).message);
  }

  revalidatePath("/");
  return NextResponse.json({ key, updatedAt, versionId });
}

/** DELETE —— 重置为静态默认（走版本流：历史不丢） */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const denied = requireAdmin(auth);
  if (denied) return denied;

  const { key } = await params;
  if (!isSiteSectionKey(key)) {
    return NextResponse.json(
      { error: "invalid_section_key", detail: "不支持的 section" },
      { status: 400 },
    );
  }

  let versionId: number;
  try {
    ({ versionId } = resetSiteSectionToDefault(
      key,
      DEFAULT_SECTIONS[key],
      auth.id,
    ));
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "invalid_section_shape") {
      /* 默认值本身形状不对 —— 是部署/代码问题，不是调用方的问题 */
      return NextResponse.json(
        {
          error: code,
          detail: "该 section 的静态默认值形状不合法，无法重置",
        },
        { status: 500 },
      );
    }
    throw e;
  }

  try {
    recordSecurityEvent({
      kind: "site_content_reset",
      userRef: null,
      actorUserId: auth.id,
      ip: clientIp(req),
      detail: { key, versionId },
    });
  } catch (e) {
    console.error("[site_content_reset] 审计失败:", (e as Error).message);
  }

  revalidatePath("/");
  return NextResponse.json({ key, reset: true, versionId });
}
