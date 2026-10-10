import COS from "cos-nodejs-sdk-v5";
import * as crypto from "node:crypto";
import { config, PHOTO_PREFIX, TRASH_PREFIX } from "./config";

const cos = new COS({
  SecretId: config.secretId,
  SecretKey: config.secretKey,
});

/* ---------- 对象键 ---------- */

const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "photo";

/** 单调递增、字典序≈时间序的短 id，比 UUID 更适合做对象键前缀 */
function sortableId(): string {
  return Date.now().toString(36) + crypto.randomBytes(4).toString("hex");
}

/**
 * 由服务端生成对象键，**绝不信前端传来的 key**。
 * 形如 photos/2026/10/m3k9x-1a2b3c4d-shanghai.jpg
 */
export function makePhotoKey(originalName: string): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${PHOTO_PREFIX}${y}/${m}/${sortableId()}-${slugify(originalName)}`;
}

export const isPhotoKey = (key: string) => key.startsWith(PHOTO_PREFIX);
/** 拒绝任何非 photos/ 前缀的对象，防止接口被拿来删元数据 */
export const isTrashKey = (key: string) => key.startsWith(TRASH_PREFIX);

/* ---------- 预签名 ---------- */

/**
 * 发放预签名 PUT URL，浏览器拿它直传 COS。
 *
 * 构造函数里传了 SecretId/SecretKey，SDK 会**同步**算好签名并直接返回字符串；
 * 若换成临时密钥则签名是异步的。调用方必须准备好走回调分支。
 */
export function presignPut(key: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (url: string) => {
      if (!settled) {
        settled = true;
        resolve(url);
      }
    };
    const fail = (err: unknown) => {
      if (!settled) {
        settled = true;
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    };

    const returned = cos.getObjectUrl(
      {
        Bucket: config.bucket,
        Region: config.region,
        Key: key,
        Method: "PUT",
        Sign: true,
        Expires: config.signExpires,
      },
      (err, data) => (err ? fail(err) : done(data.Url)),
    );

    // 同步返回非空说明签名是同步算好的，回调不会再触发
    if (typeof returned === "string" && returned) done(returned);
  });
}

/* ---------- 对象读写 ---------- */

export const putText = (key: string, body: string, contentType: string) =>
  cos.putObject({
    Bucket: config.bucket,
    Region: config.region,
    Key: key,
    Body: body,
    ContentType: contentType,
  });

/** 返回对象正文，不存在时返回 null（而不是抛错） */
export async function getText(key: string): Promise<string | null> {
  try {
    const res = await cos.getObject({
      Bucket: config.bucket,
      Region: config.region,
      Key: key,
    });
    return res.Body.toString("utf8");
  } catch (err) {
    const code = (err as { code?: string })?.code ?? "";
    const status = (err as { statusCode?: number })?.statusCode;
    if (code === "NoSuchKey" || code === "NoSuchObject" || status === 404) {
      return null;
    }
    throw err;
  }
}

export const copyObject = (fromKey: string, toKey: string) =>
  cos.putObjectCopy({
    Bucket: config.bucket,
    Region: config.region,
    Key: toKey,
    // CopySource 要的是源对象 URL（无前导斜杠），对象键需 URLEncode
    CopySource: `${config.bucket}.cos.${config.region}.myqcloud.com/${fromKey
      .split("/")
      .map(encodeURIComponent)
      .join("/")}`,
  });

export const deleteObject = (key: string) =>
  cos.deleteObject({ Bucket: config.bucket, Region: config.region, Key: key });

/** 软删除：把照片挪到 _trash/，不真删 */
export async function moveToTrash(photoKey: string): Promise<string> {
  if (!isPhotoKey(photoKey)) throw new Error("refuse: not a photo key");
  const dest = `${TRASH_PREFIX}${photoKey.slice(PHOTO_PREFIX.length)}`;
  await copyObject(photoKey, dest);
  await deleteObject(photoKey);
  return dest;
}

/** 从回收站搬回原位置 */
export async function restoreFromTrash(trashKey: string): Promise<string> {
  if (!isTrashKey(trashKey)) throw new Error("refuse: not a trash key");
  const dest = `${PHOTO_PREFIX}${trashKey.slice(TRASH_PREFIX.length)}`;
  await copyObject(trashKey, dest);
  await deleteObject(trashKey);
  return dest;
}

/** 探活：能列到对象说明密钥和权限都通 */
export async function ping(): Promise<boolean> {
  try {
    await getText("_data/.probe");
    return true;
  } catch {
    return false;
  }
}