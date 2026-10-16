#!/usr/bin/env node
/**
 * 一次性数据清理：删 ph_test（这次修 dangling 后的端到端测试遗留）
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
const next = {
  ...cur,
  revision: cur.revision + 1,
  photos: cur.photos.filter((p) => p.id !== "ph_test"),
};
const r = await writeManifest({
  revision: cur.revision,
  albums: next.albums,
  photos: next.photos,
});
if (!r.ok) {
  console.error("stale_revision, retry", r.current.revision);
  process.exit(2);
}
console.log("✓ ph_test removed");
