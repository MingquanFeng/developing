import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/signer/config";
import {
  clientIp,
  isRegisterLocked,
  noteRegisterAttempt,
  noteRegisterFail,
  noteRegisterSuccess,
  issueSession,
  setSessionCookie,
} from "@/lib/signer/auth";
import {
  createUser,
  findById,
  toPublic,
  touchLogin,
  validUsername,
  validPassword,
} from "@/lib/signer/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const ip = clientIp(req);

  // 关掉时只能靠 CLI 加人。别把这个开关去掉 ——
  // 留着它才有个紧急关停公开注册的口子。
  if (!config.registrationOpen) {
    return NextResponse.json({ error: "registration_disabled" }, { status: 403 });
  }
  // 注册是公开的，IP 限流是唯一的防刷号手段，别跟着邀请码一起删了
  if (isRegisterLocked(ip)) {
    return NextResponse.json({ error: "locked", retryAfter: 3600 }, { status: 429 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    username?: string;
    password?: string;
    displayName?: string;
  };

  const username = (body.username ?? "").trim();
  const password = body.password ?? "";

  const bad = validUsername(username) ?? validPassword(password);
  if (bad) {
    noteRegisterFail(ip, username, { reason: bad });
    return NextResponse.json({ error: "invalid_input", detail: bad }, { status: 400 });
  }

  // 每次尝试都计数：不限流的话这是个公开可无限刷号的接口
  noteRegisterAttempt(ip);

  try {
    // 角色写死 viewer：公开注册的人永远拿不到写权限。
    const created = await createUser({
      username,
      password,
      displayName: body.displayName,
    });
    const user = findById(created.id);
    if (!user) throw new Error("post_create_lookup_failed");

    // 注册即登录，省得让人再输一遍
    touchLogin(user.id);
    noteRegisterSuccess(ip, user.username);
    return NextResponse.json(
      { ok: true, user: toPublic(user) },
      {
        status: 201,
        headers: { "Set-Cookie": setSessionCookie(issueSession(user)) },
      },
    );
  } catch (e) {
    const errCode = (e as { code?: string }).code;
    if (errCode === "username_taken") {
      noteRegisterFail(ip, username, { reason: "username_taken" });
      return NextResponse.json({ error: "username_taken" }, { status: 409 });
    }
    throw e;
  }
}
