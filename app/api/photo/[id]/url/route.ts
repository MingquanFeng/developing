import { NextRequest, NextResponse } from "next/server";
import { readCookie, verifySession, sessionCookieName } from "@/lib/signer/auth";
import { findById } from "@/lib/signer/users";
import { readManifest } from "@/lib/signer/album";
import { CI_PREVIEW, CI_THUMB, config } from "@/lib/signer/config";
import { presignGet } from "@/lib/signer/cos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 发放私有图片的签名读 URL。
 *
 * 权限在这里再查一遍 —— 不能只信清单接口给不给。
 * 公开照片也走这个接口（返回签名 URL 一样能用），
 * 好处是前端只有一条加载路径，坏处是公开图也要签名。
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const manifest = await readManifest();
  const photo = manifest.photos.find((p) => p.id === id);
  if (!photo) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // 只有本人能看私有的；公开的谁都行
  const session = verifySession(readCookie(req, sessionCookieName()));
  const user = session ? findById(session.userId) : undefined;
  const isOwner = !!user && user.id === photo.ownerId;
  if (!photo.isPublic && !isOwner) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const variant =
    req.nextUrl.searchParams.get("v") === "original"
      ? "original"
      : req.nextUrl.searchParams.get("v") === "thumb"
        ? "thumb"
        : "preview";
  const ci = variant === "thumb" ? CI_THUMB : variant === "preview" ? CI_PREVIEW : undefined;

  try {
    const url = await presignGet(photo.key, ci ? { ci } : {});
    return NextResponse.json({ url, variant, expiresIn: config.readExpires });
  } catch (err) {
    return NextResponse.json(
      { error: "sign_failed", detail: String(err) },
      { status: 502 },
    );
  }
}
