import { MANIFEST_KEY } from "./config";
import { getText, putText } from "./cos";
import {
  defaultAlbum as makeDefaultAlbum,
  fallbackAlbum as makeFallbackAlbum,
} from "@/lib/album-id";
import type {
  Album as AlbumContract,
  Photo as PhotoContract,
  Manifest as ManifestContract,
  WriteResult as WriteResultContract,
} from "@/lib/contracts";

/**
 * 类型的唯一权威源在 lib/contracts.ts。本文件只是 re-export，让
 * `import type { Album, Photo, Manifest } from "@/lib/signer/album"`
 * 这条历史路径继续工作（PR-1 起 6 个月内）。新代码请直接
 * `import type { ... } from "@/lib/contracts"`。
 */
export type Album = AlbumContract;
export type Photo = PhotoContract;
export type Manifest = ManifestContract;

const EMPTY: Manifest = {
  revision: 0,
  updatedAt: new Date(0).toISOString(),
  albums: [],
  photos: [],
};

/**
 * 读清单。文件不存在时返回空清单而不是报错。
 *
 * 存量迁移：早期照片没有 ownerId / isPublic（那时相册是全局公共的）。
 * 这里一次性补齐并**写回**：
 *   ownerId  ← LEGACY_OWNER_ID（建这段历史时唯一在用的账号）
 *   isPublic ← true（原本就是公开可见的，迁移不该让它们突然消失）
 *
 * 写回而不是每次读取兜底，是因为 manifest revision 是乐观锁的依据，
 * 每次读都偷偷改会让并发编辑互相打架。
 */
export async function readManifest(): Promise<Manifest> {
  const raw = await getText(MANIFEST_KEY);
  if (!raw) return { ...EMPTY };
  try {
    const parsed = JSON.parse(raw) as Manifest;
    const albums: Album[] = (Array.isArray(parsed.albums) ? parsed.albums : []).map(
      (a) => ({ ...a, ownerId: a.ownerId ?? LEGACY_OWNER_ID }),
    );
    const rawPhotos = Array.isArray(parsed.photos) ? parsed.photos : [];

    const needsMigration =
      rawPhotos.some(
        (p) => p.isPublic === undefined || p.ownerId === undefined,
      ) ||
      (Array.isArray(parsed.albums) ? parsed.albums : []).some(
        (a) => a.ownerId === undefined,
      );

    const photos: Photo[] = rawPhotos.map((p) => ({
      ...p,
      ownerId: p.ownerId ?? LEGACY_OWNER_ID,
      isPublic: p.isPublic ?? true,
    }));

    const out: Manifest = {
      revision: Number(parsed.revision ?? 0),
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
      albums,
      photos,
    };

    if (needsMigration) {
      await putText(
        MANIFEST_KEY,
        JSON.stringify({ ...out, revision: out.revision + 1 }, null, 2),
        "application/json",
      );
      out.revision += 1;
      out.updatedAt = new Date().toISOString();
      console.log(
        `[album] 已迁移存量照片：补齐 ownerId=${LEGACY_OWNER_ID} / isPublic=true`,
      );
    }

    return out;
  } catch {
    throw new Error(`${MANIFEST_KEY} 不是合法 JSON，请检查是否被手工改坏`);
  }
}

/**
 * 存量照片的归属者。
 * 用 id 之外的稳定字符串而不是猜 userId —— 这批照片的实际上传者
 * 应该由摄影师用 CLI 指定（见 docs/HANDOFF.md「存量照片归属」）。
 */
export const LEGACY_OWNER_ID = "legacy_photographer";

/**
 * 按身份裁剪清单 —— 权限判定的唯一入口。
 *
 * 规则（刻意做成与 role 无关：管理员也只看自己的私有照片）：
 *   isPublic            → 任何人都能看
 *   ownerId === viewerId → 本人的全部（含私有、含回收站）
 *   否则                 → 不返回
 *
 * 回收站只对本人可见。
 */
export function visibleTo(
  m: Manifest,
  viewerId: string | null,
  opts: { includeTrashed?: boolean } = {},
): { albums: Album[]; photos: Photo[] } {
  const mine = (p: Photo) => viewerId !== null && p.ownerId === viewerId;

  const photos = m.photos.filter((p) => {
    if (!opts.includeTrashed && p.trashedAt && !mine(p)) return false;
    return p.isPublic || mine(p);
  });

  // 相册列表规则：
  //   - viewer 自己的相册（含 0 张照片的空相册）**必须**保留 —— 否则
  //     AlbumsTab 看不到刚建好的空相册，"toast 承诺的『请先在后台补建
  //     相册』"路径走不通（建了但看不到 → 没法挪 dangling 照片过来）。
  //   - 别人相册（含公开相册）只有挂着 viewer 可见照片时才返 —— 否则
  //     访客/别的 viewer 会看到一堆空壳。
  //   - 历史注释说"用相册内是否有本人照片判断 mine" —— 那是 ownerId
  //     没存之前的临时办法；现在 Album.ownerId 已是契约字段，按它判。
  const liveIds = new Set(photos.map((p) => p.albumId));
  const isMyAlbum = (a: Album) =>
    viewerId !== null && a.ownerId === viewerId;
  const albums = m.albums.filter((a) => liveIds.has(a.id) || isMyAlbum(a));

  return { albums, photos };
}

/**
 * 访客视角：只给公开、未进回收站的照片。
 * ⚠️ 匿名调用**必须**走这里 —— 私有照片连 key 都不能出现在响应里。
 */
export function publicManifest(m: Manifest) {
  return {
    revision: m.revision,
    updatedAt: m.updatedAt,
    ...visibleTo(m, null),
  };
}

export type WriteResult = WriteResultContract;

/**
 * 写清单，带乐观锁。
 * 前端传来的 revision 与当前不一致时拒绝写入并回传当前版本，
 * 避免两处同时编辑时后写的把先写的覆盖掉。
 */
export async function writeManifest(
  incoming: { revision: number; albums: Album[]; photos: Photo[] },
): Promise<WriteResult> {
  const current = await readManifest();
  if (Number(incoming.revision) !== current.revision) {
    return { ok: false, current };
  }

  const next: Manifest = {
    revision: current.revision + 1,
    updatedAt: new Date().toISOString(),
    albums: incoming.albums ?? [],
    photos: incoming.photos ?? [],
  };

  await putText(MANIFEST_KEY, JSON.stringify(next, null, 2), "application/json");
  return { ok: true, manifest: next };
}

/**
 * 新建默认相册，首次上传前调用一次，省得前端处理空态。
 *
 * id 格式统一走 lib/album-id（与 useManifest.defaultAlbum、fallbackAlbum、
 * scripts/fix-dangling-photo.mjs 一致）。迁移期语义不变：
 *   - 已有任意 photo 属此 owner → 不重建
 *   - 已有任意 album → 不重建（兼容历史 manifest 已经有 alb_<...>_<time> 的）
 */
export async function ensureDefaultAlbum(ownerId: string): Promise<Manifest> {
  const m = await readManifest();
  const hasOwnAlbum = m.photos.some((p) => p.ownerId === ownerId);
  if (hasOwnAlbum || m.albums.length > 0) return m;

  const album = makeDefaultAlbum(ownerId, m.albums);
  const next: Manifest = {
    ...m,
    revision: m.revision + 1,
    updatedAt: new Date().toISOString(),
    albums: [album],
  };
  await putText(MANIFEST_KEY, JSON.stringify(next, null, 2), "application/json");
  return next;
}

/**
 * 删除一个相册：
 *  - 鉴权：必须有登录 user；只能删自己 ownerId === meId 的相册
 *    （admin 角色目前不覆盖——admin 也走 mineAlbum 限定；如需 admin
 *    删任意相册，再加 meId.role === "admin" 分支——本次任务先不做）
 *  - 该相册下非回收站照片（trashedAt 为空）全部迁移到
 *    `alb_<ownerId>_fallback`（不存在则自动建一次，order=999）
 *  - 回收站照片不动
 *  - 整份走 writeManifest 乐观锁
 *  - 返回 { ok: true, manifest } | { ok: false, error: "not_found"|"forbidden"|"stale_revision", ... }
 *
 * ⚠️ 调用方应先把此函数的失败/成功 Promise 与前端 useAlbumsPanel 拼好；
 *    这次任务里只新增函数本身 + 必要的 vitest 单测。
 */
export async function deleteAlbum(
  albumId: string,
  meId: string,
  currentRevision: number,
): Promise<
  | { ok: true; manifest: Manifest }
  | {
      ok: false;
      error: "not_found" | "forbidden" | "stale_revision";
      current?: Manifest;
    }
> {
  const cur = await readManifest();

  const album = cur.albums.find((a) => a.id === albumId);
  if (!album) {
    return { ok: false, error: "not_found" };
  }
  if (album.ownerId !== meId) {
    // TODO: 若要支持 admin 删任意相册，再加 meId.role === "admin" 分支。
    return { ok: false, error: "forbidden" };
  }

  // 找 / 建 fallback 相册。owner 取 album.ownerId，与"删相册时照片搬家"语义一致。
  const ownerId = album.ownerId ?? "";
  let fallback = cur.albums.find((a) => a.slug === "fallback" && a.ownerId === ownerId);
  if (!fallback) {
    fallback = makeFallbackAlbum(ownerId, cur.albums);
  }
  const fallbackId = fallback.id;

  // 迁移：仅搬非回收站照片；trashedAt 非空的不动（用户已主动删的）
  const photos: Photo[] = cur.photos.map((p) =>
    p.albumId === albumId && !p.trashedAt
      ? { ...p, albumId: fallbackId }
      : p,
  );

  // 删 album：保留 fallback（如果原本就在 cur.albums 里）
  const albumsNext: Album[] = cur.albums.filter((a) => a.id !== albumId);
  if (!cur.albums.some((a) => a.id === fallbackId)) {
    // fallback 是这次新建的，加进去
    albumsNext.push(fallback);
  }

  const written = await writeManifest({
    revision: currentRevision,
    albums: albumsNext,
    photos,
  });
  if (!written.ok) {
    return { ok: false, error: "stale_revision", current: written.current };
  }
  return { ok: true, manifest: written.manifest };
}