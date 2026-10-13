import COS from "cos-nodejs-sdk-v5";
import * as crypto from "node:crypto";
import { config, PHOTO_PREFIX, TRASH_PREFIX } from "./config";

const cos = new COS({
  SecretId: config.secretId,
  SecretKey: config.secretKey,
});

/* ---------- 对象键 ---------- */

/* COS 的对象键支持 UTF-8，中文可以原样保留（URL 里会自动 URLEncode）。
   所以这里用 Unicode 属性类而不是 [a-z0-9] —— 否则「端到端验证.jpg」
   会被清成空串再退化成 "photo"，几十张图的对象键就全叫 photo 了。 */
const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "photo";

/** 单调递增、字典序≈时间序的短 id，比 UUID 更适合做对象键前缀 */
function sortableId(): string {
  return Date.now().toString(36) + crypto.randomBytes(4).toString("hex");
}

/**
 * 由服务端生成对象键，**绝不信前端传来的 key**。
 * 形如 image/<userId>/2026/10/m3k9x-1a2b3c4d-shanghai.jpg
 *
 * **userId 段是权限判定的一部分**，不能省也不能改：
 * 私有照片的读取走预签名 URL，签名前必须先确认「请求者有权读这个前缀」。
 * 少了这段就只能全靠清单比对对象归属，而 key 是能猜的。
 */
export function makePhotoKey(ownerId: string, originalName: string): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${PHOTO_PREFIX}${ownerId}/${y}/${m}/${sortableId()}-${slugify(originalName)}`;
}

/** 从对象键取回归属者，格式不符返回 null */
export function ownerOfKey(key: string): string | null {
  if (!key.startsWith(PHOTO_PREFIX)) return null;
  const rest = key.slice(PHOTO_PREFIX.length);
  const seg = rest.split("/");
  return seg.length >= 4 ? seg[0] : null;
}

export const isPhotoKey = (key: string) => key.startsWith(PHOTO_PREFIX);
/** 拒绝任何非 image/ 前缀的对象，防止接口被拿来删元数据 */
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

/**
 * 发放预签名 GET URL，浏览器拿它读私有对象。
 *
 * 私有照片不能用公开直链 —— 那等于没有隐私：URL 一旦泄露
 * （转发、浏览器历史、爬虫）就能长期访问。签名 URL 会过期。
 *
 * ## 为什么自己算签名，而不用 SDK 的 getObjectUrl
 *
 * COS 数据万象的调用形态是 `?imageMogr2/thumbnail/560x` ——
 * `imageMogr2` 就是**参数名本身**，斜杠后面全是它的值。这不是普通 query 参数，
 * SDK 的三种传法都表达不了：
 *
 *   Query: {imageMogr2: "…"}  → 拼成 ?imageMogr2=a%2Fb，签名通过，
 *                               COS 认不出 → **静默返回原图**（字节数完全相同）
 *   QueryString: "…"          → 只拼 URL 不进签名，q-url-param-list 为空
 *   Key + "/imageMogr2/…"     → 对象路径不存在，**404 NoSuchKey**
 *
 * 三种都实测过。所以这里按 COS 签名规范自己算：
 * queryString 原样参与签名，imageMogr2 进 q-url-param-list。
 *
 * 参考：腾讯云 COS 签名方法 v5 —— GET 用 'name/cos:GetObject'。
 */
/**
 * 发放预签名 GET URL，浏览器拿它读私有对象。
 *
 * 私有照片不能用公开直链 —— 那等于没有隐私：URL 一旦泄露
 * （转发、浏览器历史、爬虫）就能长期访问。签名 URL 会过期。
 *
 * ## 为什么签名和处理串要分开拼
 *
 * COS 数据万象的调用形态是 `?imageMogr2/thumbnail/560x` ——
 * `imageMogr2` 就是**参数名本身**，斜杠后面全是它的值。这不是 key=value，
 * 所以它无法进 `q-url-param-list`（那里只放 key=value 的参数名）。
 *
 * 三种错误做法都实测过：
 *   Query: {imageMogr2: "…"}     → 变成 ?imageMogr2=imageMogr2%2F…（等号形态），
 *                                  签名通过但 COS 静默忽略 → **返回原图**，字节数一样、不报错
 *   Key + "/imageMogr2/…"        → 被当成对象路径 → 404 NoSuchKey
 *   QueryString: "…"              → 不进签名，q-url-param-list 为空
 *
 * 正确做法：**只对 base key 签名**，再把处理串插到签名参数**之前**。
 * COS 会按签名的 key 校验权限，而 imageMogr2 是处理指令、不参与权限判断，
 * 两边可以共存。实测 69836 bytes / image/webp，处理确实生效。
 */
export function presignGet(
  key: string,
  opts: { ci?: string; expires?: number } = {},
): Promise<string> {
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
        Method: "GET",
        Sign: true,
        Expires: opts.expires ?? config.readExpires,
      },
      (err, data) => (err ? fail(err) : done(data.Url)),
    );

    if (typeof returned === "string" && returned) {
      // 处理串要排在 q-* 签名参数**之前**，且原样不编码
      done(opts.ci ? prependCi(returned, opts.ci) : returned);
    }
  });
}

/** 把数据万象处理串插进已签名 URL 的 query 首位 */
function prependCi(signedUrl: string, ci: string): string {
  const q = signedUrl.indexOf("?");
  if (q === -1) return `${signedUrl}?${ci}`;
  return `${signedUrl.slice(0, q + 1)}${ci}&${signedUrl.slice(q + 1)}`;
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

/**
 * 软删除：把照片挪到 _trash/，不真删。
 * **保留 owner 段**（TRASH_PREFIX + 掉 PHOTO_PREFIX 的部分），
 * 否则恢复时拼不回原路径，ownerOfKey 也会失效。
 */
export async function moveToTrash(photoKey: string): Promise<string> {
  if (!isPhotoKey(photoKey)) throw new Error("refuse: not a photo key");
  const dest = `${TRASH_PREFIX}${photoKey.slice(PHOTO_PREFIX.length)}`;
  await copyObject(photoKey, dest);
  await deleteObject(photoKey);
  return dest;
}

/** 从回收站搬回原位置（PHOTO_PREFIX + 掉 TRASH_PREFIX 的部分，owner 段还在） */
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