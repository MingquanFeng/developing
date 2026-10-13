import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requirePhotoOwner } from "@/lib/signer/auth";
import { moveToTrash } from "@/lib/signer/cos";
import { readManifest, writeManifest, type Photo } from "@/lib/signer/album";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 改一张照片的字段（含 isPublic 开关）。
 *
 * 单独开这个接口而不是让前端回传整份清单：开关是高频操作，
 * 走整份 PUT 每次都要拉全量再提交，别人一改就会撞乐观锁。
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const manifest = await readManifest();
  const photo = manifest.photos.find((p) => p.id === id);
  if (!photo) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const denied = requirePhotoOwner(auth, photo);
  if (denied) return denied;

  const body = (await req.json().catch(() => ({}))) as {
    isPublic?: boolean;
    title?: string;
    caption?: string;
    place?: string;
    shotAt?: string;
    albumId?: string;
  };

  const next: Photo = { ...photo };
  if (body.isPublic !== undefined) next.isPublic = !!body.isPublic;
  if (body.title !== undefined) next.title = body.title.trim();
  if (body.caption !== undefined) next.caption = body.caption;
  if (body.place !== undefined) next.place = body.place;
  if (body.shotAt !== undefined) next.shotAt = body.shotAt;
  if (body.albumId !== undefined) {
    const target = manifest.albums.find((a) => a.id === body.albumId);
    if (!target || target.ownerId !== photo.ownerId) {
      return NextResponse.json({ error: "album_not_yours" }, { status: 403 });
    }
    next.albumId = body.albumId;
  }

  const written = await writeManifest({
    revision: manifest.revision,
    albums: manifest.albums,
    photos: manifest.photos.map((p) => (p.id === id ? next : p)),
  });
  if (!written.ok) {
    return NextResponse.json(
      { error: "stale_revision", currentRevision: written.current.revision },
      { status: 409 },
    );
  }
  return NextResponse.json({
    ok: true,
    photo: next,
    revision: written.manifest.revision,
  });
}

/** 软删除 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const manifest = await readManifest();
  const photo = manifest.photos.find((p) => p.id === id);
  if (!photo) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const denied = requirePhotoOwner(auth, photo);
  if (denied) return denied;

  const trashedAt = new Date().toISOString();
  let trashKey: string | null = null;
  try {
    trashKey = await moveToTrash(photo.key);
  } catch (err) {
    return NextResponse.json(
      { error: "cos_error", detail: String(err) },
      { status: 502 },
    );
  }

  const next = manifest.photos.map((p) =>
    p.id === id ? { ...p, trashedAt } : p,
  );
  const written = await writeManifest({
    revision: manifest.revision,
    albums: manifest.albums,
    photos: next,
  });
  if (!written.ok) {
    return NextResponse.json({ error: "stale_revision" }, { status: 409 });
  }

  return NextResponse.json({
    ok: true,
    revision: written.manifest.revision,
    trashKey: trashKey ?? null,
  });
}
