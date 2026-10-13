import { NextRequest, NextResponse } from "next/server";
import {
  clientIp,
  notePasswordReset,
} from "@/lib/signer/auth";
import {
  consumeResetToken,
  findById,
  toPublic,
  updateUser,
  validPassword,
} from "@/lib/signer/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const ip = clientIp(req);

  const body = (await req.json().catch(() => ({}))) as {
    token?: string;
    newPassword?: string;
  };
  const token = (body.token ?? "").trim();
  const next = body.newPassword ?? "";

  const bad = validPassword(next);
  if (bad) {
    return NextResponse.json({ error: "invalid_input", detail: bad }, { status: 400 });
  }
  if (!token) {
    return NextResponse.json({ error: "token_not_found" }, { status: 404 });
  }

  let rec;
  try {
    rec = consumeResetToken(token);
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "token_not_found") {
      return NextResponse.json({ error: "token_not_found" }, { status: 404 });
    }
    if (code === "token_used") {
      return NextResponse.json({ error: "token_used" }, { status: 410 });
    }
    if (code === "token_expired") {
      return NextResponse.json({ error: "token_expired" }, { status: 410 });
    }
    throw e;
  }

  const user = findById(rec.userId);
  if (!user || user.disabled) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  await updateUser(user.id, { password: next });
  notePasswordReset(ip, user.username, rec.issuedBy);

  return NextResponse.json({ ok: true, username: user.username });
}
