/**
 * GET /api/site/content —— 取首页 4 个 section 的合并内容（公开）
 * ------------------------------------------------------------------
 * 公开端点：与 SSR 同源，无 cookie 也能读。只返 `sections`：
 *   - 与 SSR 同源的内容（DB 覆盖或静态兜底），后台编辑面板初始化用
 *   - 不返 `meta`（userId、updatedBy 等内部信息）—— 那是 admin 私有
 *     信息，参见 /api/site/content/meta（admin-only）。
 */
import { NextResponse } from "next/server";
import { listHomeContent } from "@/lib/data/site-content";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const sections = await listHomeContent();
  return NextResponse.json({ sections });
}