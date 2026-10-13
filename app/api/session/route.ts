import { NextRequest, NextResponse } from "next/server";
import { readCookie, verifySession, sessionCookieName } from "@/lib/signer/auth";
import { findById, toPublic } from "@/lib/signer/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 前端探会话用：200=已登录（回用户名），401=没有 */
export async function GET(req: NextRequest) {
  const s = verifySession(readCookie(req, sessionCookieName()));
  if (!s) return NextResponse.json({ ok: false }, { status: 401 });

  const user = findById(s.userId);
  if (!user || user.disabled) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  // session 失效也是 401（在这里不写日志，避免被恶意前端刷屏）
  if (user.sessionVersion !== s.sessionVersion) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  return NextResponse.json({ ok: true, user: toPublic(user) });
}
