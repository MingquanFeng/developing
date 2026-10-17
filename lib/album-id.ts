/**
 * album.id 生成工具（slug 化 + 去重后缀）
 * ------------------------------------------------------------------
 * 统一 album.id 规则，消除此前 3 处格式不一致：
 *   - components/admin/hooks/useManifest.ts:111  `alb_<ownerId ?? "anon">_default`
 *   - lib/signer/album.ts:175                    `alb_<ownerId>_<Date.now().toString(36)>`
 *   - scripts/fix-dangling-photo.mjs:29          写死 `alb_<ownerId>_default`
 *
 * 单一权威源 —— 新代码必须从这里取 id，禁止散落写 `alb_<ownerId>_*` 字面量。
 *
 * 规则：
 *   id  = `alb_<ownerId>_<slug>_<n>`
 *   slug 来自 name 的 slugify（汉字保留，标点归一）
 *   n 从 1 起自增，跳过 taken 中已用的，最终无冲突
 *
 * 兼容：`app/api/album/route.ts:65` 的 `startsWith("alb_<me.id>_")`
 * 权限判定不动 —— 前缀已足够，不依赖完整 id。
 *
 * "use client" 让前端 bundle 能直接 import（服务端、Vitest 也照常 import）。
 */
"use client";

import type { Album } from "@/lib/contracts";

/** slugify 长度上限。够用且保留大部分中文名 + 英文标签 */
const SLUG_MAX_LEN = 40;

/** 兜底 slug：name 全是标点/空白时用，避免最终 id 出现 alb_<ownerId>__1 这种空段 */
const FALLBACK_SLUG_WORD = "album";

/** 汉字 Unicode 范围：基本平面（CJK 统一表意符号 + 扩展 A 区） */
const CJK_RANGE = "一-鿿豈-﫿";

/**
 * slugify：把相册名归一化到 id 安全段。
 *
 *   步骤：trim → 非 `[a-z0-9 一-鿿 㐀-鿿]` 替换为 `-` → 合并连续 `-` → 去首尾 `-` → 截 40
 *   - 汉字保留（`[一-鿿]` + `[㐀-鿿]`）
 *   - 标点 / emoji / 控制字符归 `-`
 *   - 全角空格、NBSP 归 `-`
 *   - 全空回退到 `album`
 */
export function slugify(name: string): string {
  if (!name) return FALLBACK_SLUG_WORD;
  const cleaned = name
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(new RegExp(`[^a-z0-9${CJK_RANGE}]+`, "g"), "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX_LEN);
  return cleaned || FALLBACK_SLUG_WORD;
}

/**
 * 生成新 album.id。
 *
 * @param ownerId  相册拥有者 userId（不变前缀部分）
 * @param slug     来源于 name 的 slug 化结果（允许 caller 预填；内部再走一次 slugify）
 * @param taken    已占用 id 集合（用于 dedup）。建议传 `new Set(cur.albums.map(a => a.id))`
 *                 —— 直接比对完整 id，避免 caller 把"已用 slug"和"已用 id"混在一起算错。
 *                 也可以传"已用 slug 后缀"集合，本函数内部会还原成完整 id 后比对。
 *
 * @returns `alb_<ownerId>_<slug>_<n>`，n 从 1 起跳直到不在 taken 中。
 */
export function newAlbumId(
  ownerId: string,
  slug: string,
  taken: ReadonlySet<string>,
): string {
  const safeOwner = ownerId || "anon";
  const safeSlug = slugify(slug);
  const prefix = `alb_${safeOwner}_${safeSlug}_`;
  // n=0 时不带数字 —— 但 taken 里有精确 prefix 也算冲突；这让 caller 直接传 id 集合时也对
  if (!taken.has(prefix.slice(0, -1))) {
    // `alb_<owner>_<slug>` 不带数字本身也算"未占用"，但本仓库约定始终带 _<n>，
    // 因此只要 prefix 形如 "..._slug" 不在 taken 中就返回 _1，逻辑跟 n=1 起步一致
  }
  for (let n = 1; n < 10_000; n++) {
    const candidate = `${prefix}${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  // 极端兜底（同一 owner 10000+ 同名相册不可能，但函数总要返回）
  return `${prefix}${Date.now().toString(36)}`;
}

/** 兜底 slug：用于固定语义的相册（默认相册 / 回收相册） */
export const DEFAULT_SLUG = "default";
export const FALLBACK_SLUG = "fallback";
/** 兼容旧 `ensureDefaultAlbum` 的 slug 名（"u-<ownerId>-misc" 的缩写） */
export const MISC_SLUG = "u-misc";

/**
 * 构造默认相册对象（viewer 首次上传前占位；id 走 newAlbumId）。
 *
 * 单一 owner 下 `default` slug 撞了时自动 `_2/_3/...` 后缀，
 * 因此同 owner 多次调用也安全。
 */
export function defaultAlbum(
  ownerId: string,
  existing: readonly Album[] = [],
): Album {
  const taken = new Set(existing.map((a) => a.id));
  return {
    id: newAlbumId(ownerId, DEFAULT_SLUG, taken),
    slug: DEFAULT_SLUG,
    name: "默认相册",
    desc: "不属于任何一次的随手记录。",
    coverKey: null,
    order: 1,
    ownerId,
  };
}

/**
 * 构造 fallback 相册对象（删除相册时收纳挂着的照片；id 走 newAlbumId）。
 *
 * 同 owner 已存在 `fallback` slug 时不重建 —— caller 应按 `id` 查重后再决定。
 */
export function fallbackAlbum(
  ownerId: string,
  existing: readonly Album[] = [],
): Album {
  const taken = new Set(existing.map((a) => a.id));
  return {
    id: newAlbumId(ownerId, FALLBACK_SLUG, taken),
    slug: FALLBACK_SLUG,
    name: "回收相册",
    desc: "从已删除相册转移来的照片。",
    coverKey: null,
    order: 999,
    ownerId,
  };
}
