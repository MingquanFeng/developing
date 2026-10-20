/**
 * GET /api/site/content —— 取首页 4 个 section 的合并内容
 * ------------------------------------------------------------------
 * 公开端点：与 SSR 同源，无 cookie 也能读。返回：
 *   - sections: DB 覆盖值（若没有则回落静态默认值）
 *   - meta:     各 key 的元信息（updatedAt + updatedBy）
 *
 * 后台编辑面板拿这份数据初始化表单；访客 SSR 不走这里（走 cache）。
 */
import { NextResponse } from "next/server";
import {
  listHomeContent,
} from "@/lib/data/site-content";
import { listSiteContentMeta } from "@/lib/signer/site-content";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const sections = await listHomeContent();
  const meta = listSiteContentMeta();
  return NextResponse.json({ sections, meta });
}