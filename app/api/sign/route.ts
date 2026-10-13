import { NextRequest, NextResponse } from "next/server";
import { ALLOWED_TYPES, MAX_FILES_PER_BATCH, MAX_FILE_BYTES } from "@/lib/signer/config";
import {
  isPhotoKey,
  makePhotoKey,
  ownerOfKey,
  presignPut,
} from "@/lib/signer/cos";
import { requireAuth } from "@/lib/signer/auth";
import { ensureDefaultAlbum } from "@/lib/signer/album";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 发放预签名上传 URL。
 *
 * 任何登录用户都能传 —— 传进**自己**的目录。
 * 归属由会话决定，不看 role：管理员也只拥有自己传的。
 */
export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const me = auth;

  const body = (await req.json().catch(() => null)) as {
    files?: { name?: string; size?: number; type?: string }[];
  } | null;

  const files = body?.files;
  if (!Array.isArray(files) || files.length === 0) {
    return NextResponse.json({ error: "no_files" }, { status: 400 });
  }
  if (files.length > MAX_FILES_PER_BATCH) {
    return NextResponse.json(
      { error: "too_many_files", max: MAX_FILES_PER_BATCH },
      { status: 400 },
    );
  }

  const items = [];
  for (const f of files) {
    if (!f.name || !f.type || !ALLOWED_TYPES.has(f.type)) {
      return NextResponse.json(
        { error: "unsupported_type", name: f.name, allowed: [...ALLOWED_TYPES] },
        { status: 400 },
      );
    }
    if ((f.size ?? 0) > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: "file_too_large", name: f.name },
        { status: 400 },
      );
    }

    // key 由服务端生成，前端无从干预；ownerId 强制取会话里的
    const key = makePhotoKey(me.id, f.name);
    if (!isPhotoKey(key) || ownerOfKey(key) !== me.id) {
      return NextResponse.json({ error: "bad_key" }, { status: 500 });
    }
    const url = await presignPut(key);
    items.push({ key, url, expiresAt: Date.now() + 600 * 1000 });
  }

  // 首次上传前自动建一个默认相册，省得前端处理空态
  await ensureDefaultAlbum(me.id);

  return NextResponse.json({
    uploadId: `up_${Date.now().toString(36)}`,
    ownerId: me.id,
    items,
  });
}
