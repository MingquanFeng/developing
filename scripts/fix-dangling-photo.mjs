#!/usr/bin/env node
/**
 * 一次性数据修复：把 COS manifest 里 albumId='' 的 photo 改成对应 viewer 自己的
 * defaultAlbum id，同时确保 defaultAlbum 存在。
 *
 * 这是 PR 期间测试遗留的脏数据——viewer 上传会被卡在
 * "PUT /api/album 400 album_not_found"，因为这条 photo 进入合并后的
 * mergedPhotos 后被 dangling 检查拒。
 *
 * 一次性脚本，跑一次即可。
 */
import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
loadEnv({ path: path.join(__dirname, "..", ".env"), quiet: true });

const { readManifest, writeManifest } = await import(
  path.join(__dirname, "..", "dist", "album.js")
);

const cur = await readManifest();
const SUFFIX = "_default";
let changed = 0;
const fixed = (cur.photos ?? []).map((p) => {
  if (p.albumId && p.albumId !== "") return p;
  const targetId = `alb_${p.ownerId}${SUFFIX}`;
  console.log(`  fix photo ${p.id}: albumId '' -> ${targetId}`);
  changed++;
  return { ...p, albumId: targetId };
});

const albums = [...cur.albums];
for (const p of fixed) {
  if (!albums.some((a) => a.id === p.albumId)) {
    console.log(`  add default album ${p.albumId}`);
    albums.push({
      id: p.albumId,
      slug: "default",
      name: "默认相册",
      desc: "",
      coverKey: null,
      order: 0,
      ownerId: p.ownerId,
    });
  }
}

if (changed === 0 && albums.length === cur.albums.length) {
  console.log("manifest 无需修复。");
  process.exit(0);
}

const r = await writeManifest({
  revision: cur.revision,
  albums,
  photos: fixed,
});
if (!r.ok) {
  console.error("stale_revision, retry", r.current.revision);
  process.exit(2);
}
console.log(`✓ done: ${changed} photo(s) fixed, manifest updated`);
