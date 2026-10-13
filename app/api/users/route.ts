import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, requireAuth } from "@/lib/signer/auth";
import {
  countUsers,
  createUser,
  listUsers,
  validPassword,
  validUsername,
} from "@/lib/signer/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  return NextResponse.json({ users: listUsers() });
}

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const denied = requireAdmin(auth);
  if (denied) return denied;

  const body = (await req.json().catch(() => ({}))) as {
    username?: string;
    password?: string;
    displayName?: string;
    role?: "admin" | "viewer";
  };
  const username = (body.username ?? "").trim();

  const bad = validUsername(username) ?? validPassword(body.password ?? "");
  if (bad) {
    return NextResponse.json({ error: "invalid_input", detail: bad }, { status: 400 });
  }

  if (body.role !== undefined && body.role !== "admin" && body.role !== "viewer") {
    return NextResponse.json(
      { error: "invalid_input", detail: "角色只能是 admin 或 viewer" },
      { status: 400 },
    );
  }

  try {
    const user = await createUser({
      username,
      password: body.password!,
      displayName: body.displayName,
      role: body.role,
    });
    return NextResponse.json({ user }, { status: 201 });
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "username_taken") {
      return NextResponse.json({ error: "username_taken" }, { status: 409 });
    }
    throw e;
  }
}
