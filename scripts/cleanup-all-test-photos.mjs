#!/usr/bin/env node
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
const cleaned = cur.photos.filter((p) => !p.id.startsWith("ph_test"));
if (cleaned.length === cur.photos.length) {
  console.log("无需清理。");
  process.exit(0);
}
const r = await writeManifest({
  revision: cur.revision,
  albums: cur.albums,
  photos: cleaned,
});
if (!r.ok) {
  console.error("stale_revision");
  process.exit(2);
}
console.log(`✓ removed ${cur.photos.length - cleaned.length} test photo(s)`);
