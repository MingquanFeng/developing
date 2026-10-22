/**
 * GET /api/site/content/versions —— 取首页内容的版本历史（admin-only）
 * ------------------------------------------------------------------
 * 查询参数：
 *   ?key=hero   只看某一节的版本；省略 → 全部 key 的版本
 *
 * ⚠️ 整个端点必须 admin-only：版本里带 `createdBy`（发布者的
 *   admin userId）与 `basedOnId`（谁基于哪一版改的），属内部信息。
 *   公开端点 GET /api/site/content 只返 sections，不返历史。
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireAdmin } from "@/lib/signer/auth";
import {
  isSiteSectionKey,
  listSiteContentVersions,
} from "@/lib/signer/site-content";
import type { SiteContentVersionsResponse } from "@/lib/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const denied = requireAdmin(auth);
  if (denied) return denied;

  const key = req.nextUrl.searchParams.get("key");
  if (key !== null && !isSiteSectionKey(key)) {
    return NextResponse.json(
      { error: "invalid_section_key", detail: "不支持的 section" },
      { status: 400 },
    );
  }

  const body: SiteContentVersionsResponse = {
    versions: listSiteContentVersions(key ?? undefined),
  };
  return NextResponse.json(body);
}
