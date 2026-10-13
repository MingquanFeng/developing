import { NextRequest, NextResponse } from "next/server";
import {
  clientIp,
  notePasswordReset,
  requireAdmin,
  requireAuth,
} from "@/lib/signer/auth";
import {
  createResetToken,
  findById,
} from "@/lib/signer/users";
import { RESET_TOKEN_TTL_SEC } from "@/lib/signer/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin 生成"重置密码链接"（一次性、24h）。
 *
 * 这里故意不返 token 明文以外的额外信息 —— URL 由后端拼好，
 * admin 直接复制贴给对方。下一次看见"url 已发出"才算完成；
 * 没有邮件依赖，admin 自己承担"送达"（电话/微信/线下都行）。
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const denied = requireAdmin(auth);
  if (denied) return denied;

  const ip = clientIp(req);
  const { id } = await params;
  const target = findById(id);
  if (!target) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (target.disabled) {
    return NextResponse.json({ error: "user_disabled" }, { status: 400 });
  }

  const { token, expiresAt } = createResetToken(
    target.id,
    auth.id,
    RESET_TOKEN_TTL_SEC,
  );

  // 通过 Origin 或 Referer 拼回访客页面域名；拿不到就退到 localhost:3000
  const from = req.headers.get("origin") || req.headers.get("referer") || "";
  const u = new URL(
    from && /^https?:\/\//.test(from) ? from : "http://localhost:3000",
  );
  u.pathname = "/reset-password/";
  u.searchParams.set("token", token);
  u.hash = "";

  notePasswordReset(ip, target.username, auth.username);

  return NextResponse.json({
    url: u.toString(),
    expiresAt,
    ttlSec: RESET_TOKEN_TTL_SEC,
    targetUsername: target.username,
  });
}
