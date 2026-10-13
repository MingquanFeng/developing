import { NextRequest, NextResponse } from "next/server";
import { PHOTO_PREFIX, TRASH_PREFIX } from "@/lib/signer/config";
import { deleteObject, isPhotoKey, isTrashKey } from "@/lib/signer/cos";
import { requireAuth, requirePhotoOwner } from "@/lib/signer/auth";
import { readManifest, writeManifest } from "@/lib/signer/album";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 彻底删除 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const manifest = await readManifest();
  const photo = manifest.photos.find((p) => p.id === id);
  const denied = requirePhotoOwner(auth, photo);
  if (denied) return denied;

  const target = photo!.trashedAt
    ? `${TRASH_PREFIX}${photo!.key.slice(PHOTO_PREFIX.length)}`
    : photo!.key;
  // 只允许删 image/ 或 _trash/ 下的对象，别让接口被拿来删 _data/
  if (!isPhotoKey(target) && !isTrashKey(target)) {
    return NextResponse.json({ error: "refuse" }, { status: 400 });
  }

  await deleteObject(target);
  const written = await writeManifest({
    revision: manifest.revision,
    albums: manifest.albums,
    photos: manifest.photos.filter((p) => p.id !== id),
  });
  if (!written.ok) {
    return NextResponse.json({ error: "stale_revision" }, { status: 409 });
  }

  return NextResponse.json({ ok: true, revision: written.manifest.revision });
}
