import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, requireAuth } from "@/lib/signer/auth";
import { findById, listResetTokensByUser } from "@/lib/signer/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 给前端列出某用户还活着的重置链接（仅 admin），便于"已经发了哪些"可见 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireAuth(_req);
  if (auth instanceof NextResponse) return auth;
  const denied = requireAdmin(auth);
  if (denied) return denied;

  const { id } = await params;
  if (!findById(id)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const rows = listResetTokensByUser(id)
    .filter((r) => !r.usedAt && Date.parse(r.expiresAt) > Date.now())
    .map((r) => ({
      expiresAt: r.expiresAt,
      issuedBy: r.issuedBy,
    }));
  return NextResponse.json({ tokens: rows });
}
