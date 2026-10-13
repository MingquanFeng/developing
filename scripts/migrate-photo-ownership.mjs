#!/usr/bin/env node
/**
 * 一次性数据迁移：把历史 owner 错挂在 `usr_mv4uzl9m5zne`（fmq 测试 ID）
 * 上的所有 photo 改到 `usr_mv4lcfwpcq6k`（photog admin），并删空 album。
 *
 * 跑：
 *   node scripts/migrate-photo-ownership.mjs
 *
 * 幂等：所有 ownerId 已正确的 photo 不会被重写。
 */

import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
loadEnv({ path: path.join(__dirname, "..", ".env"), quiet: true });

// 业务模块（dist 是 tsc 编译产物，album/users 走 tsc 的 helper）
const { readManifest, writeManifest } = await import(
  path.join(__dirname, "..", "dist", "album.js")
);
const { findByUsername } = await import(
  path.join(__dirname, "..", "dist", "users.js")
);

const FROM_USERNAME = "fmq"; // 历史 owner（测试 viewer）
const TO_USERNAME = "photog"; // admin

const fromUser = findByUsername(FROM_USERNAME);
if (!fromUser) {
  console.log(`源用户 ${FROM_USERNAME} 不存在，无需迁移。`);
  process.exit(0);
}
const toUser = findByUsername(TO_USERNAME);
if (!toUser) {
  console.error(`目标用户 ${TO_USERNAME} 不存在，先建管理员。`);
  process.exit(1);
}

const cur = await readManifest();

const photosToMove = cur.photos.filter((p) => p.ownerId === fromUser.id);
if (photosToMove.length === 0) {
  console.log(`没有需要迁移的 photo（owner=${FROM_USERNAME}）。已无操作。`);
  process.exit(0);
}

const albumsToMove = cur.albums.filter((a) => a.ownerId === fromUser.id);

const next = {
  ...cur,
  revision: cur.revision + 1,
  updatedAt: new Date().toISOString(),
  photos: cur.photos.map((p) =>
    p.ownerId === fromUser.id ? { ...p, ownerId: toUser.id } : p,
  ),
  albums: cur.albums.map((a) =>
    a.ownerId === fromUser.id ? { ...a, ownerId: toUser.id } : a,
  ),
};

const r = await writeManifest({
  revision: cur.revision,
  albums: next.albums,
  photos: next.photos,
});

if (!r.ok) {
  console.error("stale_revision — 请重试", r.current.revision);
  process.exit(2);
}

console.log(
  `✓ 迁移完成：${photosToMove.length} 张 photo、${albumsToMove.length} 个 album` +
    ` 从 ${FROM_USERNAME} → ${TO_USERNAME}`,
);
console.log(`  目标用户 ${TO_USERNAME} (id=${toUser.id}) 现在共 ${
  r.manifest.photos.filter((p) => p.ownerId === toUser.id).length
} 张 photo`);
