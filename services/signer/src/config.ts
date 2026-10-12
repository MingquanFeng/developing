import { config as loadDotenv } from "dotenv";
import * as path from "node:path";

/** .env 与进程同目录（services/signer/.env），从任意 cwd 启动都能读到 */
loadDotenv({ path: path.join(__dirname, "..", ".env") });

function must(key: string): string {
  const v = process.env[key]?.trim();
  if (!v) throw new Error(`缺少必需的环境变量 ${key}，见 services/signer/.env.example`);
  return v;
}

export const config = {
  port: Number(process.env.PORT ?? 8787),

  /** 允许跨域访问的来源，逗号分隔 */
  allowedOrigins: (process.env.ALLOWED_ORIGIN ?? "http://localhost:3000")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),

  bucket: must("COS_BUCKET"),
  region: must("COS_REGION"),
  secretId: must("COS_SECRET_ID"),
  secretKey: must("COS_SECRET_KEY"),

  /** 会话签名密钥。没配则退化为从口令哈希派生 */
  sessionSecret: process.env.SESSION_SECRET?.trim() ?? "",

  /** 预签名 URL 有效期（秒）。短一点，避免链接被长期盗用 */
  signExpires: 600,
};

/** 会话有效期 30 天 */
export const SESSION_TTL_SEC = 60 * 60 * 24 * 30;

/** 相册元数据在 COS 上的位置 */
export const MANIFEST_KEY = "_data/album.json";

/** 对象键前缀。改这里要同步改桶策略里放行的前缀，否则前端会 403 */
export const PHOTO_PREFIX = "image/";
export const TRASH_PREFIX = "_trash/";

/** 允许上传的 MIME 与单文件上限 */
export const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);
export const MAX_FILE_BYTES = 50 * 1024 * 1024;
export const MAX_FILES_PER_BATCH = 50;