#!/usr/bin/env node
/**
 * 一次性数据修复：把 manifest.photos 里 COS 上不存在的照片条目删掉。
 *
 * 起因：上传流程若中途失败（断网 / 客户端关闭 / quota 超限）会留下
 * "manifest 有 photo 但 COS 没对象" 的脏数据。后台瀑布显示 broken image
 * 加上 React error overlay 报 NoSuchKey（已修成 404 not_found）。
 * 这个脚本彻底清掉脏数据。
 *
 * 用 cos.headObject 探测：HEAD 请求轻量、不下载对象体，COS 返回 404 即不存在。
 *
 * 一次性脚本，跑一次即可。
 */
import { config as loadEnv } from "dotenv";
import COS from "cos-nodejs-sdk-v5";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
loadEnv({ path: path.join(__dirname, "..", ".env"), quiet: true });

const { COS_BUCKET, COS_REGION, COS_SECRET_ID, COS_SECRET_KEY } = process.env;
if (!COS_BUCKET || !COS_REGION || !COS_SECRET_ID || !COS_SECRET_KEY) {
  console.error(
    "缺少 COS 配置（.env 里 COS_BUCKET / COS_REGION / COS_SECRET_ID / COS_SECRET_KEY）",
  );
  process.exit(2);
}

const { readManifest, writeManifest } = await import(
  path.join(__dirname, "..", "dist", "album.js")
);

const cos = new COS({
  SecretId: COS_SECRET_ID,
  SecretKey: COS_SECRET_KEY,
  Protocol: "https:",
});

/* cos.headObject 包成 Promise */
const head = (key) =>
  new Promise((resolve, reject) => {
    cos.headObject(
      { Bucket: COS_BUCKET, Region: COS_REGION, Key: key },
      (err, data) => (err ? reject(err) : resolve(data)),
    );
  });

const isMissing = (err) => {
  const code = err?.code ?? "";
  const status = err?.statusCode ?? 0;
  return (
    code === "NoSuchKey" ||
    code === "NoSuchObject" ||
    status === 404
  );
};

const cur = await readManifest();
const removable = [];
const errors = [];

const DRY_RUN = process.argv.includes("--dry-run") || process.argv.includes("-n");
const SKIP_PROBE = process.argv.includes("--skip-probe");

console.log(
  `扫描 ${cur.photos.length} 张照片在 COS 上的存在性${DRY_RUN ? "（dry-run 不写回）" : ""}...\n`,
);

if (SKIP_PROBE && DRY_RUN) {
  console.log("--skip-probe 仅用于 mock：dry-run 模式下默认仍探测。");
}

for (const p of cur.photos) {
  try {
    await head(p.key);
  } catch (err) {
    if (isMissing(err)) {
      removable.push(p.id);
      console.log(`  ✗ ${p.id}  key=${p.key}`);
    } else {
      errors.push({ id: p.id, key: p.key, err: String(err) });
      console.error(`  ! ${p.id} 探测失败（保留）：${String(err)}`);
    }
  }
}

if (removable.length === 0) {
  console.log("\nmanifest 干净，无需清理。");
  process.exit(0);
}

console.log(`\n将${DRY_RUN ? "（dry-run 不写）" : ""}删除 ${removable.length} 条 COS 上不存在的照片条目`);

if (DRY_RUN) {
  console.log("\n[dry-run] 未写回 manifest。去掉 --dry-run 实跑：");
  console.log("  node scripts/clean-no-such-key.mjs");
  process.exit(0);
}

const remainingPhotos = cur.photos.filter((p) => !removable.includes(p.id));
const r = await writeManifest({
  revision: cur.revision,
  albums: cur.albums,
  photos: remainingPhotos,
});
if (!r.ok) {
  console.error("stale_revision, retry", r.current.revision);
  process.exit(2);
}
console.log(
  `\n✓ done: removed ${removable.length} photo(s), ${errors.length} detection error(s) left in place`,
);