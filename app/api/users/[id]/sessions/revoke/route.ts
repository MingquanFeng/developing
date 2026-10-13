import { NextRequest, NextResponse } from "next/server";
import {
  clientIp,
  noteSessionRevoked,
  requireAdmin,
  requireAuth,
} from "@/lib/signer/auth";
import { bumpSessionVersion, countAdmins, findById } from "@/lib/signer/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin 一键踢出某账号 —— bump sessionVersion，所有旧 token 立即 401。
 *
 * 不允许：
 * - 踢自己（防止自杀锁死）
 * - 踢最后一名 admin
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
  if (id === auth.id) {
    return NextResponse.json({ error: "cannot_revoke_self" }, { status: 400 });
  }
  const target = findById(id);
  if (!target) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (target.role === "admin" && countAdmins() <= 1) {
    return NextResponse.json({ error: "last_admin" }, { status: 400 });
  }

  const next = bumpSessionVersion(id);
  if (next === null) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  noteSessionRevoked(ip, target.username, auth.username);

  return NextResponse.json({ ok: true, sessionVersion: next });
}
