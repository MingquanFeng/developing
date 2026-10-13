import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, requireAuth } from "@/lib/signer/auth";
import {
  deleteUser,
  findById,
  updateUser,
  validPassword,
} from "@/lib/signer/users";
import { readManifest, writeManifest } from "@/lib/signer/album";
import { deleteObject } from "@/lib/signer/cos";

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

  const target = findById(id);
  if (!target) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  /**
   * 删除前先清掉该用户留下的资源：
   *   1. 删 COS 对象（每个 photo，未在回收站的删，已在回收站的不动 —— 那些元数据也清）
   *   2. 写 manifest：移除该 user 名下的所有 photo + album
   *   3. 删 users 表行
   *
   * 顺序保证失败时不留半截状态：
   *   - COS 删失败 → 抛 502，不写 manifest 不删 user（用户可重试）
   *   - manifest 写失败（stale）→ 重试 3 次，仍失败抛 500
   *   - 删 user 失败 → 抛 500，admin 看见的快照是"用户仍存在 / 元数据已清"，
   *     重试即可（deleteUser 的 last_user / last_admin 闸门照常生效）
   */
  const manifest = await readManifest();
  const myPhotos = manifest.photos.filter((p) => p.ownerId === id);
  const myAlbums = manifest.albums.filter((a) => a.ownerId === id);

  let objectsDeleted = 0;
  const objectErrors: { key: string; error: string }[] = [];
  for (const p of myPhotos) {
    if (p.trashedAt) continue; // 回收站里的 photo 元数据一并清，对象不动
    try {
      await deleteObject(p.key);
      objectsDeleted += 1;
    } catch (err) {
      objectErrors.push({ key: p.key, error: String(err) });
    }
  }
  if (objectErrors.length) {
    return NextResponse.json(
      {
        error: "cos_error",
        detail: `${objectErrors.length} 个对象删不掉，请稍后重试`,
        failed: objectErrors,
      },
      { status: 502 },
    );
  }

  // 写 manifest：剔除该 user 的所有 photo 与 album
  // stale_revision 重试 3 次（防并发编辑造成乐观锁抖动）
  let attempt = 0;
  let written;
  while (attempt < 3) {
    const cur = await readManifest();
    const next = {
      revision: cur.revision + 1,
      updatedAt: new Date().toISOString(),
      albums: cur.albums.filter((a) => a.ownerId !== id),
      photos: cur.photos.filter((p) => p.ownerId !== id),
    };
    const r = await writeManifest({
      revision: cur.revision,
      albums: next.albums,
      photos: next.photos,
    });
    if (r.ok) {
      written = r.manifest;
      break;
    }
    attempt += 1;
  }
  if (!written) {
    return NextResponse.json(
      { error: "stale_revision_after_retries" },
      { status: 500 },
    );
  }

  try {
    deleteUser(id);
  } catch (e) {
    const code = (e as { code?: string }).code;
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

  return NextResponse.json({
    ok: true,
    deleted: {
      photos: myPhotos.length,
      albums: myAlbums.length,
      objectsDeleted,
    },
  });
}
