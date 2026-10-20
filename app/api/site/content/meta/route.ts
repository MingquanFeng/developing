/**
 * GET /api/site/content/meta —— 取首页 section 的元信息（admin-only）
 * ------------------------------------------------------------------
 * meta 含 `updatedAt` + `updatedBy`（admin userId）—— 后者属内部信息，
 * 不应暴露给未登录访客。公开端点 GET /api/site/content 只返 sections。
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireAdmin } from "@/lib/signer/auth";
import { listSiteContentMeta } from "@/lib/signer/site-content";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  const auth = requireAuth(_req);
  if (auth instanceof NextResponse) return auth;
  const denied = requireAdmin(auth);
  if (denied) return denied;

  return NextResponse.json({ meta: listSiteContentMeta() });
}