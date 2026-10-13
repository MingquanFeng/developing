import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, requireAuth } from "@/lib/signer/auth";
import {
  deleteUser,
  findById,
  updateUser,
  validPassword,
} from "@/lib/signer/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const denied = requireAdmin(auth);
  if (denied) return denied;

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    displayName?: string;
    password?: string;
    disabled?: boolean;
    role?: "admin" | "viewer";
  };

  const patch: {
    displayName?: string;
    password?: string;
    disabled?: boolean;
    role?: "admin" | "viewer";
  } = {};

  if (body.displayName !== undefined) {
    patch.displayName = body.displayName.trim();
  }
  if (body.password) {
    const bad = validPassword(body.password);
    if (bad) {
      return NextResponse.json({ error: "invalid_input", detail: bad }, { status: 400 });
    }
    patch.password = body.password;
  }
  if (body.disabled !== undefined) {
    patch.disabled = !!body.disabled;
  }
  if (body.role !== undefined) {
    if (body.role !== "admin" && body.role !== "viewer") {
      return NextResponse.json(
        { error: "invalid_input", detail: "角色只能是 admin 或 viewer" },
        { status: 400 },
      );
    }
    patch.role = body.role;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "nothing_to_update" }, { status: 400 });
  }

  try {
    return NextResponse.json({ user: await updateUser(id, patch) });
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "not_found") {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (code === "last_admin") {
      return NextResponse.json(
        { error: "last_admin", detail: "至少要保留一个管理员，否则将无人能管理用户" },
        { status: 400 },
      );
    }
    throw e;
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const denied = requireAdmin(auth);
  if (denied) return denied;

  const { id } = await params;
  if (auth.id === id) {
    return NextResponse.json({ error: "cannot_delete_self" }, { status: 400 });
  }

  try {
    deleteUser(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "not_found") {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (code === "last_user") {
      return NextResponse.json(
        { error: "last_user", detail: "至少要保留一个用户，否则谁都进不来" },
        { status: 400 },
      );
    }
    if (code === "last_admin") {
      return NextResponse.json(
        { error: "last_admin", detail: "至少要保留一个管理员，否则将无人能管理用户" },
        { status: 400 },
      );
    }
    throw e;
  }
}
