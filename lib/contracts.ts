/**
 * 全站公共契约（前后端共用类型）
 * ------------------------------------------------------------------
 * 这里只放"通过网络边界序列化"的纯数据类型与异常类型。不放函数、不放
 * 任何运行时副作用。
 *
 * 边界规则：
 *   - 前后端都得 import 这个文件；服务端的 sqlite/cos/Node 依赖都不能进
 *     来。出现一次就该警觉 —— 这是 PR-1 的契约。
 *   - 命名一律用现实业务词（Photo、Album、Manifest、PublicUser），
 *     不叫 DTO / VO 这类纯后端味的名字。
 *
 * 历史：以前 Album/Photo 在 lib/album-types.ts，PublicUser 在
 *       lib/album-client.ts 与 lib/signer/users.ts 各一份。合并后两端
 *       各处都改 import from "@/lib/contracts"，旧路径再 re-export 兼容
 *       6 个月（PR-1 注释）。
 */

/* ============================================================
   角色与会话
   ============================================================ */

/** 用户角色：admin 全权、viewer 只看自己 */
export type Role = "admin" | "viewer";

/** 服务端 User 持久化结构（含密码哈希，绝不外发） */
export type User = {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  disabled: boolean;
  /** 会话版本号。改密 / 重置 / 踢人后必须 bump，否则旧 cookie 仍能用 */
  sessionVersion: number;
  createdAt: string;
  lastLoginAt?: string;
  /** 最近一次登录来源 IP（来自 x-forwarded-for） */
  lastLoginIp?: string | null;
  /** 永远不上网络：bcrypt 哈希 */
  passwordHash: string;
};

/** 网络上跑的 User：不带密码哈希。跟前端的字段一一对应 */
export type PublicUser = Omit<User, "passwordHash">;

/** Session cookie 解码后的样子 */
export type SessionToken = { userId: string; sessionVersion: number };

/* ============================================================
   相册与照片
   ============================================================ */

/**
 * 相册。后端据此拒绝把照片写进别人的相册。
 * ownerId 可选 —— 早期种子数据未填时默认 LEGACY_OWNER_ID。
 */
export type Album = {
  id: string;
  slug: string;
  name: string;
  desc: string;
  /** 显式封面 photo.key；为空则取该相册第一张公开图 */
  coverKey: string | null;
  order: number;
  ownerId?: string;
};

/** 一张照片。权限判定一律看 ownerId，不看 role */
export type Photo = {
  id: string;
  /** COS 对象键（或完整外链，按 lib/album-types 约定） */
  key: string;
  albumId: string;
  /** 归属者 userId */
  ownerId: string;
  /** true = 任意访客可看，false = 只有 owner 拿签名 URL */
  isPublic: boolean;
  title: string;
  caption: string;
  place: string;
  /** 拍摄时间 YYYY-MM-DD */
  shotAt: string;
  width: number;
  height: number;
  bytes: number;
  /** 软删除时间。非空表示在回收站 */
  trashedAt?: string | null;
};

/** 全站相册清单。revision 走乐观锁 */
export type Manifest = {
  revision: number;
  updatedAt: string;
  albums: Album[];
  photos: Photo[];
};

/** 写清单结果：成功带新 revision / 失败带服务端当前 revision */
export type WriteResult =
  | { ok: true; manifest: Manifest }
  | { ok: false; current: Manifest };

/* ============================================================
   用户管理 API 响应
   ============================================================ */

/** 一条重置链接响应（服务端生成一次性 token） */
export type ResetLinkResponse = {
  /** 一次性登录链接，含 ?token=… */
  url: string;
  /** ISO 字符串 */
  expiresAt: string;
  /** 链接剩余有效秒数（= RESET_TOKEN_TTL_SEC） */
  ttlSec: number;
  /** 给 UI 提示当前用户是谁 */
  targetUsername: string;
};

/* ============================================================
   首页内容（后台动态化首期）
   ============================================================ */

/**
 * 首页后台可编辑的 section key。已支持 6 节：
 * - hero / about / subscribe / footer / story / nav
 * 后续 interlude01 / interlude03 / coords / worksIntro / site
 * 会在下一期加入。
 */
export type SiteSectionKey =
  | "hero"
  | "about"
  | "subscribe"
  | "footer"
  | "story"
  | "nav";

/** 一节内容的元信息（updatedAt + 改 userId） */
export type SiteContentMeta = {
  key: SiteSectionKey;
  updatedAt: string;
  updatedBy: string | null;
};

/**
 * 按 key 索引对应 section 的精确内容类型。
 * SDK / 后台编辑器都用它做端到端类型校验（不光是 DB 表层 isHero）。
 *
 * 与 lib/data/*.ts 的字面类型同步：lib/data 改 schema 必须同步改这里。
 */
import type { hero } from "./data/home";
import type { about } from "./data/about";
import type { subscribe } from "./data/subscribe";
import type { footer } from "./data/footer";
import type { story } from "./data/story";
import type { nav } from "./data/nav";

export type SectionContent<K extends SiteSectionKey> = K extends "hero"
  ? typeof hero
  : K extends "about"
    ? typeof about
    : K extends "subscribe"
      ? typeof subscribe
      : K extends "footer"
        ? typeof footer
        : K extends "story"
          ? typeof story
          : K extends "nav"
            ? typeof nav
            : never;

/* ============================================================
   错误契约
   ============================================================ */

/**
 * /api/* 出错时统一返回这个形状：
 *   { error: string; detail?: string; hint?: string; retryAfter?: number; … }
 *
 * 不强制各端点带每一字段；不存在的就省略。
 *
 * error 是机器可读的短码（"bad_request" / "stale_revision" / "forbidden" …），
 * detail 是给前端拼人类可读消息用，hint 给更具体的诊断线索。
 */
export type ApiError = {
  error: string;
  detail?: string;
  hint?: string;
  /** 429 才有：剩余等待秒数 */
  retryAfter?: number;
  /** 409 才有：服务端当前 revision */
  currentRevision?: number;
  /** 400 album_not_found 时附带：前 10 张 dangling photo 的 id */
  photoIds?: string[];
};
