import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import {
  clientIp,
  issueSession,
  notePasswordChanged,
  requireAuth,
  setSessionCookie,
} from "@/lib/signer/auth";
import { findById, toPublic, updateUser, validPassword } from "@/lib/signer/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const me = auth;

  const body = (await req.json().catch(() => ({}))) as {
    currentPassword?: string;
    newPassword?: string;
  };

  const cur = body.currentPassword ?? "";
  const next = body.newPassword ?? "";

  const bad = validPassword(next);
  if (bad) {
    return NextResponse.json({ error: "invalid_input", detail: bad }, { status: 400 });
  }
  if (!cur) {
    return NextResponse.json({ error: "wrong_current_password" }, { status: 400 });
  }

  // 必须知道旧密码 —— 哪怕会话没被盗，也想被劫持者改不了
  const ok = await bcrypt.compare(cur, me.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: "wrong_current_password" }, { status: 400 });
  }

  // updateUser 默认 bumpSessionVersion=true —— 旧会话自动 401
  await updateUser(me.id, { password: next });
  notePasswordChanged(ip, me.username, "self");

  // 给当前会话发新 token（含新 version），其它设备的会话就被 401 挡掉了
  const fresh = findById(me.id);
  if (!fresh) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json(
    { ok: true, user: toPublic(fresh) },
    { headers: { "Set-Cookie": setSessionCookie(issueSession(fresh)) } },
  );
}
