import { config, MANIFEST_KEY } from "./config";
import { getText, putText } from "./cos";

export type Album = {
  id: string;
  slug: string;
  name: string;
  desc: string;
  coverKey: string | null;
  order: number;
};

export type Photo = {
  id: string;
  key: string;
  albumId: string;
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

/** 读清单。文件不存在时返回空清单而不是报错 */
export async function readManifest(): Promise<Manifest> {
  const raw = await getText(MANIFEST_KEY);
  if (!raw) return { ...EMPTY };
  try {
    const parsed = JSON.parse(raw) as Manifest;
    return {
      revision: Number(parsed.revision ?? 0),
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
      albums: Array.isArray(parsed.albums) ? parsed.albums : [],
      photos: Array.isArray(parsed.photos) ? parsed.photos : [],
    };
  } catch {
    throw new Error(`${MANIFEST_KEY} 不是合法 JSON，请检查是否被手工改坏`);
  }
}

/** 访客视角：只给已发布且未进回收站的照片 */
export function publicManifest(m: Manifest) {
  return {
    revision: m.revision,
    updatedAt: m.updatedAt,
    albums: m.albums,
    photos: m.photos.filter((p) => !p.trashedAt),
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
export async function ensureDefaultAlbum(): Promise<Manifest> {
  const m = await readManifest();
  if (m.albums.length > 0) return m;

  const album: Album = {
    id: `alb_${Date.now().toString(36)}`,
    slug: "misc",
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

export const adminPasswordConfigured = () => config.passwordHash.length > 0;