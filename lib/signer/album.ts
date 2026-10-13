import { MANIFEST_KEY } from "./config";
import { getText, putText } from "./cos";

export type Album = {
  id: string;
  slug: string;
  name: string;
  desc: string;
  coverKey: string | null;
  order: number;
  /** 归属者 userId。存量相册没有此字段，按 LEGACY_OWNER_ID 处理 */
  ownerId?: string;
};

export type Photo = {
  id: string;
  key: string;
  albumId: string;
  /** 归属者 userId。这是权限的唯一真相来源 */
  ownerId: string;
  /**
   * 是否对所有人公开。
   * true  → 任何人（含未登录）都能看
   * false → 只有 owner 本人能看到，读取走预签名 URL
   *
   * ⚠️ 存量照片没有这个字段，读取时按 true 处理（迁移见 readManifest）。
   */
  isPublic: boolean;
  title: string;
  caption: string;
  place: string;
  shotAt: string;
  width: number;
  height: number;
  bytes: number;
  /** 软删除时间。非空表示已进回收站，访客侧不可见 */
  trashedAt?: string | null;
};

export type Manifest = {
  revision: number;
  updatedAt: string;
  albums: Album[];
  photos: Photo[];
};

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

  // 相册列表只保留「还有可见照片」的，否则会出现空相册壳子
  const liveIds = new Set(photos.map((p) => p.albumId));
  const albums = m.albums.filter(
    (a) => liveIds.has(a.id) || mine2(a, m, viewerId),
  );

  return { albums, photos };
}

/** 相册本身没有 ownerId，用「相册内是否有本人照片」判断 */
const mine2 = (a: Album, m: Manifest, viewerId: string | null) =>
  viewerId !== null && m.photos.some((p) => p.albumId === a.id && p.ownerId === viewerId);

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

export type WriteResult =
  | { ok: true; manifest: Manifest }
  | { ok: false; reason: "stale_revision"; current: Manifest };

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
    return { ok: false, reason: "stale_revision", current };
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

/** 新建默认相册，首次上传前调用一次，省得前端处理空态 */
export async function ensureDefaultAlbum(ownerId: string): Promise<Manifest> {
  const m = await readManifest();
  // 已经给这个用户建过就不重复建
  const hasOwnAlbum = m.photos.some((p) => p.ownerId === ownerId);
  if (hasOwnAlbum || m.albums.length > 0) return m;

  const album: Album = {
    id: `alb_${ownerId}_${Date.now().toString(36)}`,
    slug: `u-${ownerId}-misc`,
    name: "未成册",
    desc: "不属于任何一次的随手记录。",
    coverKey: null,
    order: 1,
  };
  const next: Manifest = {
    ...m,
    revision: m.revision + 1,
    updatedAt: new Date().toISOString(),
    albums: [album],
  };
  await putText(MANIFEST_KEY, JSON.stringify(next, null, 2), "application/json");
  return next;
}