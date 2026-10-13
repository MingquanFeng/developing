/**
 * 服务端配置
 * ------------------------------------------------------------------
 * Next.js 进程会从项目根的 `.env` 自动加载环境变量（无需 dotenv）。
 * 这里只做 shape 校验与默认值。
 *
 * 启动时若必需项缺失会立即抛错，便于在容器 / 部署脚本里发现问题。
 */

function must(key: string): string {
  const v = process.env[key]?.trim();
  if (!v) {
    throw new Error(
      `缺少必需的环境变量 ${key}，见 .env.example`,
    );
  }
  return v;
}

export const config = {
  /** 腾讯云 COS 桶 */
  bucket: must("COS_BUCKET"),
  region: must("COS_REGION"),
  secretId: must("COS_SECRET_ID"),
  secretKey: must("COS_SECRET_KEY"),

  /** 会话签名密钥。没配则服务拒绝启动 */
  sessionSecret: process.env.SESSION_SECRET?.trim() ?? "",

  /**
   * 是否开放网页注册。
   *
   * true  = 任何人可在 /register/ 自助注册，拿到的是 **viewer**
   * false = 关闭网页注册，只能 CLI 加人：npm run user -- add <用户名> --admin
   *
   * 注册只管「谁能建账号」，**不保护照片**。
   */
  registrationOpen: process.env.REGISTRATION_OPEN?.trim() === "true",

  /** 预签名 URL 有效期（秒）。短一点，避免链接被长期盗用 */
  signExpires: 600,

  /** 私有图片的签名读 URL 有效期（秒） */
  readExpires: 900,
};

/**
 * 数据万象处理串 —— **带 `imageMogr2/` 前缀**。
 * cos.ts 的 presignGet 自己算签名，会原样拼成 `?imageMogr2/<这里>`。
 *
 * ⚠️ 这两个形态不要混用（都实测过）：
 *   ?imageMogr2/thumbnail/560x  → ✅ 生效
 *   ?imageMogr2=auto-orient/…  → ❌ 静默返回原图
 *   /imageMogr2/thumbnail/560x  → ❌ 404 NoSuchKey
 */
export const CI_THUMB =
  "imageMogr2/auto-orient/thumbnail/560x/format/webp/quality/80";
export const CI_PREVIEW =
  "imageMogr2/auto-orient/thumbnail/1600x/format/webp/quality/85";

/** 会话有效期 30 天 */
export const SESSION_TTL_SEC = 60 * 60 * 24 * 30;

/** 重置密码链接有效期 24h —— 走线下送达，太短对方来不及点 */
export const RESET_TOKEN_TTL_SEC = 60 * 60 * 24;

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
