import { NextRequest, NextResponse } from "next/server";
import { readCookie, requireAuth, sessionCookieName, verifySession } from "@/lib/signer/auth";
import { findById } from "@/lib/signer/users";
import {
  publicManifest,
  readManifest,
  visibleTo,
  writeManifest,
  type Album,
  type Photo,
} from "@/lib/signer/album";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 读清单。
 * - 匿名调用 → 返 publicManifest（只含 isPublic 照片 + 公开相册壳子）
 * - 登录调用 → 返 visibleTo：自己的全部（含私有 / 含回收站）+ 公开照
 *
 * 任何人都能看用户选择公开的部分；只有登录用户能看自己的私有照。
 */
export async function GET(req: NextRequest) {
  const manifest = await readManifest();
  // 不强 requireAuth：未登录时 cookies 里没 token，匿名也走这条路
  const session = verifySession(readCookie(req, sessionCookieName()));
  const user = session ? findById(session.userId) : undefined;

  if (!user || user.disabled || user.sessionVersion !== session?.sessionVersion) {
    return NextResponse.json(publicManifest(manifest));
  }
  return NextResponse.json({
    ...visibleTo(manifest, user.id),
    revision: manifest.revision,
    updatedAt: manifest.updatedAt,
  });
}

/**
 * 写清单。
 *
 * 前端送回整份清单，但**只有本人的条目会被采纳**：
 * 别人的照片与相册一律按服务端现值保留。
 * 这样做是因为乐观锁是整份 revision 比对，若允许整份覆盖，
 * 两个用户同时编辑就会互相抹掉对方的东西。
 */
export async function PUT(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const me = auth;

  const body = (await req.json().catch(() => null)) as {
    revision?: number;
    albums?: unknown;
    photos?: unknown;
  } | null;

  if (!body || typeof body.revision !== "number") {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const current = await readManifest();
  const incomingPhotos = (body.photos ?? []) as Photo[];
  const incomingAlbums = (body.albums ?? []) as Album[];

  /** 这个相册归不归当前用户。存量相册归 LEGACY_OWNER_ID，也要认 */
  const mineAlbum = (a: Album) =>
    a.ownerId === me.id || a.id.startsWith(`alb_${me.id}_`);

  // 以服务端现值为底，只挑出请求者自己名下的条目
  const keptPhotos = current.photos.filter((p) => p.ownerId !== me.id);
  const myAlbums = incomingAlbums.filter(mineAlbum);
  // 别人的相册：永远原样保留。
  // 旧逻辑加 `&& !incomingAlbums.some((b) => b.id === a.id)` 看似"想删就
  // 删"，但 viewer GET 时 `visibleTo` 会把公开照片引用的他人 album 也
  // 一起带回（viewer 看到的相册列表里包含 admin 的 album 是正常的）。
  // viewer 写入时这些 album id 出现在 incomingAlbums 里，被这条规则误判
  // 为"viewer 想覆盖/删除"——admin album 被丢，但 admin 的 photo 仍被
  // `keptPhotos` 保留 → 下一个 dangling 检查 → 400 album_not_found。
  // 任何 viewer 删除/修改他人 album 的能力本就不该有（被 mineAlbum 限制），
  // 这里多删一道只会误伤，删掉。
  const keptAlbums = current.albums.filter((a) => !mineAlbum(a));

  const mergedPhotos: Photo[] = [
    ...keptPhotos,
    ...incomingPhotos
      .filter((p) => p.ownerId === me.id)
      .map((p) => ({ ...p, ownerId: me.id })),
  ];
  const mergedAlbums: Album[] = [...keptAlbums, ...myAlbums];

  // 引用完整性：照片不能指向不存在的相册。
  //
  // ⚠️ 这里**不能**把对不上的 albumId 悄悄改成别的相册或清空 ——
  // 那会让照片「看起来正常」却已经挂错地方，是静默的数据损坏。
  // 目标相册不存在时保留原值，让前端能看出异常。
  //
  // 修：原代码用 `p.albumId && !albumIds.has(p.albumId)` —— 空字符串
  // albumId 被短路掉（'' 视为不存在），导致存了「albumId=''」的悬挂
  // photo，下次任何 viewer PUT 时这条历史数据都触发 album_not_found。
  // 修成显式判断：空字符串也算 dangling。
  const albumIds = new Set(mergedAlbums.map((a) => a.id));
  const dangling = mergedPhotos.filter((p) => {
    const aid = (p.albumId ?? "").trim();
    if (aid === "") return true;
    return !albumIds.has(aid);
  });
  if (dangling.length) {
    return NextResponse.json(
      {
        error: "album_not_found",
        detail: `${dangling.length} 张照片指向不存在的相册，请先在后台补建相册`,
        photoIds: dangling.slice(0, 10).map((p) => p.id),
      },
      { status: 400 },
    );
  }

  const result = await writeManifest({
    revision: body.revision,
    albums: mergedAlbums,
    photos: mergedPhotos,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: "stale_revision", currentRevision: result.current.revision },
      { status: 409 },
    );
  }
  return NextResponse.json({
    revision: result.manifest.revision,
    updatedAt: result.manifest.updatedAt,
  });
}
