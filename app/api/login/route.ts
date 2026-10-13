import { NextRequest, NextResponse } from "next/server";
import { clientIp } from "@/lib/signer/auth";
import {
  isLocked,
  noteFailure,
  clearFailures,
  noteLoginSuccess,
  issueSession,
  setSessionCookie,
  checkCredentials,
} from "@/lib/signer/auth";
import { countUsers, toPublic, touchLogin } from "@/lib/signer/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const ip = clientIp(req);

  const body = (await req.json().catch(() => ({}))) as {
    username?: string;
    password?: string;
  };
  const username = (body.username ?? "").trim();

  if (!username) {
    return NextResponse.json({ error: "username_required" }, { status: 400 });
  }
  if (isLocked(ip, username)) {
    return NextResponse.json({ error: "locked", retryAfter: 900 }, { status: 429 });
  }
  if (countUsers() === 0) {
    return NextResponse.json(
      {
        error: "no_users",
        hint: "请先在服务器上执行 npm run user -- add <用户名>",
      },
      { status: 503 },
    );
  }

  const user = await checkCredentials(username, body.password ?? "");
  if (!user) {
    noteFailure(ip, username);
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  clearFailures(ip, username);
  touchLogin(user.id, ip);
  noteLoginSuccess(ip, user.username);

  return NextResponse.json(
    { ok: true, user: toPublic(user) },
    { headers: { "Set-Cookie": setSessionCookie(issueSession(user)) } },
  );
}
