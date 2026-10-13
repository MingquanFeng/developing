import { NextRequest, NextResponse } from "next/server";
import { PHOTO_PREFIX, TRASH_PREFIX } from "@/lib/signer/config";
import { restoreFromTrash } from "@/lib/signer/cos";
import { requireAuth, requirePhotoOwner } from "@/lib/signer/auth";
import { readManifest, writeManifest } from "@/lib/signer/album";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 恢复（回收站） */
export async function POST(
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
  if (!photo!.trashedAt) {
    return NextResponse.json({ error: "not_trashed" }, { status: 400 });
  }

  // 恢复后的对象键由 restoreFromTrash 决定，这里同步算一遍好写回元数据
  const restoredKey = `${PHOTO_PREFIX}${photo!.key.slice(PHOTO_PREFIX.length)}`;
  try {
    await restoreFromTrash(
      `${TRASH_PREFIX}${photo!.key.slice(PHOTO_PREFIX.length)}`,
    );
  } catch (err) {
    return NextResponse.json(
      { error: "cos_error", detail: String(err) },
      { status: 502 },
    );
  }

  const next = manifest.photos.map((p) =>
    p.id === id ? { ...p, key: restoredKey, trashedAt: null } : p,
  );
  const written = await writeManifest({
    revision: manifest.revision,
    albums: manifest.albums,
    photos: next,
  });
  if (!written.ok) {
    return NextResponse.json({ error: "stale_revision" }, { status: 409 });
  }

  return NextResponse.json({ ok: true, revision: written.manifest.revision });
}
