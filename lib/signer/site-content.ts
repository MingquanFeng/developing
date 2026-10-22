/**
 * 首页内容持久层 —— SQLite 读写 + 结构校验
 * ------------------------------------------------------------------
 * 设计：
 *   - 与 users / security_log 同库（共享 _db.ts 单例，避免连接竞争）
 *   - 表 schema 在 users.ts 的 db.exec 里建（统一迁移入口）
 *   - 写入端做结构校验（手写类型守卫，不引 zod）
 *   - 不接触静态默认值 —— 默认值由 lib/data/site-content.ts 的
 *     seed 函数喂进来
 *
 * ⚠️ 所有 db.prepare 都在函数内 lazy 执行：site_content 表由
 * users.ts 的 db.exec 建；如果 site-content.ts 在 users.ts 之前被
 * import，模块顶层 prepare 会因表不存在抛错。
 */
import { db, execWithRetry } from "./_db";
import { NAV_ANCHORS } from "@/lib/data/nav";
import type { SiteContentVersion, SiteSectionKey } from "@/lib/contracts";

export type { SiteContentVersion, SiteSectionKey } from "@/lib/contracts";

/**
 * 全部 section key —— 与 lib/contracts.ts 的 SiteSectionKey 一一对应。
 *
 * 单一事实来源：路由层校验 key、seed 遍历、后台下拉框都用它。
 * 之前只有 [key]/route.ts 里手写一份 Set，改 key 时容易漏改一处。
 */
export const SITE_SECTION_KEYS = [
  "hero",
  "about",
  "subscribe",
  "footer",
  "story",
  "nav",
  "interlude01",
  "interlude03",
  "coords",
  "worksIntro",
  "site",
  "series",
] as const satisfies readonly SiteSectionKey[];

/** key 白名单校验 —— 路由层用它挡掉任意字符串 */
export function isSiteSectionKey(s: string): s is SiteSectionKey {
  return (SITE_SECTION_KEYS as readonly string[]).includes(s);
}

/**
 * 建 site_content 表。
 *
 * 本模块自己建自己的表（不靠 users.ts 代劳）—— 这样单测只 import
 * 本模块就能拿到可用表，不必连带加载 users.ts 的 config 依赖
 * （config 在 import 时校验 COS_* / SESSION_SECRET 等 env）。
 *
 * 幂等：CREATE TABLE IF NOT EXISTS + 每次启动都跑一遍。老部署首次跑
 * 即建表，不需要单独迁移。
 */
function ensureSiteContentTable(): void {
  execWithRetry(`
    CREATE TABLE IF NOT EXISTS site_content (
      section_key TEXT PRIMARY KEY,           -- 'hero' | 'about' | 'subscribe' | 'footer' | 'story' | 'nav' | 'interlude01' | 'interlude03' | 'coords' | 'worksIntro' | 'site' | 'series'
      content     TEXT NOT NULL,              -- JSON.stringify(content)
      updated_at  TEXT NOT NULL,
      updated_by  TEXT                        -- userId，审计
    );
    CREATE INDEX IF NOT EXISTS idx_site_content_updated ON site_content(updated_at);
  `);
}
ensureSiteContentTable();

/**
 * 建版本表 —— 追加写的历史流。
 *
 * site_content 只存「当前生效」的那一份；这里存**每一次**发布/重置的
 * 完整快照。旧版本永不删 —— 后台要能翻历史、串版本链。
 *
 * 幂等：CREATE TABLE IF NOT EXISTS，每次启动都跑一遍。
 */
function ensureSiteContentVersionsTable(): void {
  execWithRetry(`
    CREATE TABLE IF NOT EXISTS site_content_versions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,  -- 版本号（同 key 内越大越新）
      section_key TEXT NOT NULL,                     -- 'hero' | 'about' | ...
      content     TEXT NOT NULL,                     -- JSON.stringify(content) 完整快照
      created_at  TEXT NOT NULL,                     -- ISO
      created_by  TEXT,                              -- userId；NULL = seed / 迁移回填
      is_current  INTEGER NOT NULL DEFAULT 0,        -- 1 = 当前生效
      based_on_id INTEGER                             -- 基于哪个版本改的
    );
    CREATE INDEX IF NOT EXISTS idx_site_content_versions_key
      ON site_content_versions(section_key, id DESC);
  `);
}
ensureSiteContentVersionsTable();

/**
 * 事务包装 —— 版本流的关键。
 *
 * 版本表与 site_content 必须同生共死：中途失败若留下「两个 current」，
 * 或「current 版本的内容」与「site_content 里的内容」不一致，后台历史
 * 就会撒谎（说生效的是 A，页面显示的是 B）。所以这两张表的写必须
 * 包在同一个事务里。
 *
 * BEGIN 用 IMMEDIATE —— 立刻拿写锁，避免两个发布并发时在 COMMIT
 * 阶段才撞锁（那会变成 SQLITE_BUSY 而整笔回滚）。
 */
function inTransaction<T>(fn: () => T): T {
  execWithRetry("BEGIN IMMEDIATE");
  try {
    const out = fn();
    execWithRetry("COMMIT");
    return out;
  } catch (e) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* 回滚失败不掩盖原始错误 —— 原始错误才是根因 */
    }
    throw e;
  }
}

/**
 * 一节内容的元信息（审计/列表用）。
 */
export type SiteContentMeta = {
  key: SiteSectionKey;
  updatedAt: string;
  updatedBy: string | null;
};

/* ---------- 读 ---------- */

/**
 * 取单个 section 的运行时覆盖值。
 * 返回 null 表示该 section 没有被 admin 改过（应回落到 lib/data 默认值）。
 */
export function getSiteSection<T = unknown>(key: SiteSectionKey): T | null {
  const row = db
    .prepare(
      "SELECT content, updated_at, updated_by FROM site_content WHERE section_key = ?",
    )
    .get(key) as
    | { content: string; updated_at: string; updated_by: string | null }
    | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.content) as T;
  } catch {
    /* JSON 损坏视为缺失 */
    return null;
  }
}

/**
 * 取所有 section 的元信息（key + 时间戳），用于后台列表展示。
 */
export function listSiteContentMeta(): SiteContentMeta[] {
  const rows = db
    .prepare(
      "SELECT section_key, updated_at, updated_by FROM site_content ORDER BY section_key",
    )
    .all() as {
    section_key: SiteSectionKey;
    updated_at: string;
    updated_by: string | null;
  }[];
  return rows.map((r) => ({
    key: r.section_key,
    updatedAt: r.updated_at,
    updatedBy: r.updated_by,
  }));
}

/* ---------- 写 ---------- */

/**
 * 写入一节内容（覆盖或新增）—— **底层原语**，不进版本流。
 *
 * 对外的内容变更一律走 publishSiteSection / resetSiteSectionToDefault：
 * 只有那两条会写版本历史。这条留着的用途有两个：
 *   - seed（种子内容不是「发布」，没有作者也没有前序版本）
 *   - 迁移回填（把老部署的既有覆盖值补成一条基线版本）
 *
 * - 自动校验内容形状（hero / about / subscribe / footer 各有不同的形状）
 * - 写入后返回新的 updatedAt
 * - 抛 ApiCodeError：invalid_section_shape | unknown_section_key
 */
export function setSiteSection<T = unknown>(
  key: SiteSectionKey,
  content: T,
  updatedBy: string | null,
): { updatedAt: string } {
  if (!isValidSection(key, content)) {
    throw Object.assign(new Error("invalid_section_shape"), {
      code: "invalid_section_shape",
      key,
    });
  }
  const updatedAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO site_content (section_key, content, updated_at, updated_by)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(section_key) DO UPDATE SET
       content    = excluded.content,
       updated_at = excluded.updated_at,
       updated_by = excluded.updated_by`,
  ).run(key, JSON.stringify(content), updatedAt, updatedBy);
  return { updatedAt };
}

/**
 * 删除一节运行时覆盖（**不进版本流**）—— 底层原语。
 *
 * 对外的「重置为默认」走 resetSiteSectionToDefault：它会追加一条
 * 版本记录，让历史不丢。这条只用于测试里清理环境。
 */
export function resetSiteSection(key: SiteSectionKey): void {
  db.prepare("DELETE FROM site_content WHERE section_key = ?").run(key);
}

/**
 * 首次启动种子：把 lib/data 现有静态值写入。
 * 仅当表为空时执行一次 —— 已有覆盖值的部署不会被覆盖。
 * 用 INSERT OR IGNORE：表为空时逐 key 写，有错（已存在）跳过。
 *
 * 种子同时写一条版本（created_by = NULL）—— 后台打开历史页能看到
 * 「起始版本」，而不是一片空白。
 *
 * ⚠️ 已经有版本历史的 key 一律跳过（连 site_content 也不写）：
 *   「所有 section 都被重置过」时 site_content 会空掉，下次启动会
 *   再走一遍 seed。若那时把默认值写回 site_content，就会盖掉
 *   admin 刚刚重置出来的状态。跳过 = 保持「回落到静态默认」。
 *
 * 这个函数被 users.ts migrate 末尾调用 —— 跟其他迁移同 lifecycle。
 */
export function seedSiteContentIfEmpty(
  defaults: Readonly<Partial<Record<SiteSectionKey, unknown>>>,
): void {
  const row = db
    .prepare("SELECT COUNT(*) AS n FROM site_content")
    .get() as { n: number };
  if (row.n > 0) return;
  const now = new Date().toISOString();
  inTransaction(() => {
    const stmt = db.prepare(
      `INSERT OR IGNORE INTO site_content (section_key, content, updated_at, updated_by)
       VALUES (?, ?, ?, ?)`,
    );
    const vStmt = db.prepare(
      `INSERT INTO site_content_versions
         (section_key, content, created_at, created_by, is_current, based_on_id)
       VALUES (?, ?, ?, NULL, 1, NULL)`,
    );
    for (const [key, content] of Object.entries(defaults)) {
      if (!isValidSection(key as SiteSectionKey, content)) {
        /* 形状不匹配 —— 跳过，不污染表 */
        continue;
      }
      /* 已经有版本的 key：不动。理由见函数注释。 */
      if (hasVersionFor(key as SiteSectionKey)) continue;
      const payload = JSON.stringify(content);
      stmt.run(key, payload, now, null);
      vStmt.run(key, payload, now);
    }
  });
}

/** 该 key 是否已有版本记录 */
function hasVersionFor(key: SiteSectionKey): boolean {
  const row = db
    .prepare(
      "SELECT 1 AS x FROM site_content_versions WHERE section_key = ? LIMIT 1",
    )
    .get(key) as { x: number } | undefined;
  return !!row;
}

/* ============================================================
   版本流 —— 追加写的历史
   ------------------------------------------------------------------
   site_content 只留「当前生效」的那一份；site_content_versions 记
   下每一次发布/重置的完整快照。旧版本永远留着，后台能翻历史、
   能把任意一条捞回编辑器再发布（发布时带 basedOnId 串版本链）。
   ============================================================ */

/** 版本表的一行（DB 原样） */
type VersionRow = {
  id: number;
  section_key: SiteSectionKey;
  content: string;
  created_at: string;
  created_by: string | null;
  is_current: number;
  based_on_id: number | null;
};

/**
 * 发布一节内容 —— 追加一条版本 + 同步 site_content。
 *
 * 三件事在一个事务里做完（顺序不能换）：
 *   1. 同 key 的旧版本卸任（is_current 1 → 0）
 *   2. 插入新版本（is_current = 1，based_on_id = 本次基于的版本）
 *   3. upsert site_content —— 页面读的还是这张表
 *
 * updatedAt 与版本表的 created_at 用同一个时间戳：两者描述的是
 * 同一次发布，分开写会出现「meta 显示的时间」与「历史里的时间」
 * 对不上的诡异 diff。
 *
 * basedOnId = null 表示「从当前版本改的」（不显式指定链）；
 * 传具体 id 表示「从那一版改的」—— 恢复历史版本时前端会带上它。
 */
export function publishSiteSection(
  key: SiteSectionKey,
  content: unknown,
  updatedBy: string | null,
  basedOnId?: number | null,
): { updatedAt: string; versionId: number } {
  if (!isValidSection(key, content)) {
    throw Object.assign(new Error("invalid_section_shape"), {
      code: "invalid_section_shape",
      key,
    });
  }
  const updatedAt = new Date().toISOString();
  const payload = JSON.stringify(content);
  return inTransaction(() => {
    /* 1. 旧版本卸任 —— 只影响同一 key */
    db.prepare(
      "UPDATE site_content_versions SET is_current = 0 WHERE section_key = ? AND is_current = 1",
    ).run(key);

    /* 2. 追加新版本 */
    const inserted = db
      .prepare(
        `INSERT INTO site_content_versions
           (section_key, content, created_at, created_by, is_current, based_on_id)
         VALUES (?, ?, ?, ?, 1, ?)`,
      )
      .run(key, payload, updatedAt, updatedBy, basedOnId ?? null);
    const versionId = Number(inserted.lastInsertRowid);

    /* 3. site_content 覆盖写 —— 保持与 setSiteSection 相同的写入语义 */
    db.prepare(
      `INSERT INTO site_content (section_key, content, updated_at, updated_by)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(section_key) DO UPDATE SET
         content    = excluded.content,
         updated_at = excluded.updated_at,
         updated_by = excluded.updated_by`,
    ).run(key, payload, updatedAt, updatedBy);

    return { updatedAt, versionId };
  });
}

/**
 * 重置为默认 —— 追加一条「默认内容」的版本，并删掉 site_content 里
 * 该 key 的运行时覆盖行（读取时回落到静态默认值）。
 *
 * ⚠️ 为什么不复用 publishSiteSection：重置之后 site_content 里
 *    **不该**有这一行。有行就意味着「这份内容来自 DB」，会盖住
 *    静态默认值的后续改动；「回落到静态默认」要求的是没有覆盖行。
 *    所以这里是删行，而版本表里留一条默认内容的快照作为凭证。
 *
 * based_on_id 指向重置前的当前版本 —— 重置也是「从某一版改出来的」。
 */
export function resetSiteSectionToDefault(
  key: SiteSectionKey,
  defaultContent: unknown,
  updatedBy: string | null,
): { versionId: number } {
  if (!isValidSection(key, defaultContent)) {
    throw Object.assign(new Error("invalid_section_shape"), {
      code: "invalid_section_shape",
      key,
    });
  }
  const now = new Date().toISOString();
  return inTransaction(() => {
    const previousId = getCurrentVersionId(key);

    db.prepare(
      "UPDATE site_content_versions SET is_current = 0 WHERE section_key = ? AND is_current = 1",
    ).run(key);

    const inserted = db
      .prepare(
        `INSERT INTO site_content_versions
           (section_key, content, created_at, created_by, is_current, based_on_id)
         VALUES (?, ?, ?, ?, 1, ?)`,
      )
      .run(key, JSON.stringify(defaultContent), now, updatedBy, previousId);
    const versionId = Number(inserted.lastInsertRowid);

    db.prepare("DELETE FROM site_content WHERE section_key = ?").run(key);

    return { versionId };
  });
}

/**
 * 取某个 key 当前生效的版本 id（没有则 null）。
 */
function getCurrentVersionId(key: SiteSectionKey): number | null {
  const row = db
    .prepare(
      "SELECT id FROM site_content_versions WHERE section_key = ? AND is_current = 1 LIMIT 1",
    )
    .get(key) as { id: number } | undefined;
  return row ? row.id : null;
}

/**
 * 列出版本历史。
 *
 * - 不传 key → 全部 key 的版本，按 section_key ASC、id DESC 排
 * - 传 key   → 该 key 的版本，按 id DESC（新的在前）
 * - 单条 JSON 损坏 → 跳过那一条，不让整个列表 500
 *
 * ⚠️ 每块最多返回 MAX_VERSIONS_PER_KEY 条（最新的那些）。
 *    版本的 content 是**完整快照**（每条 1~3 KB），一次全量返回是
 *    「发布次数 × 块数 × 快照大小」—— 攒够几百条就是个几十 MB 的
 *    JSON，后台一打开就卡死。历史本身永远留在 DB 里（追加写，不删），
 *    这里只是**返回窗口**：后台看最近的历史，够用；要看更老的，
 *    以后再加分页。
 *
 *    窗口取最新的 N 条 —— 当前生效版本必然在最前面，不会被截掉。
 */
export const MAX_VERSIONS_PER_KEY = 200;

export function listSiteContentVersions(
  key?: SiteSectionKey,
): SiteContentVersion[] {
  const columns = `id, section_key, content, created_at, created_by, is_current, based_on_id`;
  /* 不传 key 时逐块取 —— 每个 key 一条带 LIMIT 的查询。
     比一条无 LIMIT 的全表扫可控：任何一块的版本数都不会拖垮响应。 */
  const targets = key ? [key] : SITE_SECTION_KEYS;
  const rows: VersionRow[] = [];
  for (const k of targets) {
    rows.push(
      ...(db
        .prepare(
          `SELECT ${columns} FROM site_content_versions
            WHERE section_key = ? ORDER BY id DESC LIMIT ?`,
        )
        .all(k, MAX_VERSIONS_PER_KEY) as VersionRow[]),
    );
  }
  /* 跨 key 时按 section_key ASC、id DESC 排（同 key 内新的在前） */
  rows.sort(
    (a, b) =>
      a.section_key.localeCompare(b.section_key) || b.id - a.id,
  );
  return rows.flatMap((r) => {
    const v = toVersion(r);
    return v ? [v] : [];
  });
}

/**
 * 取单条版本。找不到（或内容损坏）返回 null。
 */
export function getSiteContentVersion(
  id: number,
): SiteContentVersion | null {
  const row = db
    .prepare(
      `SELECT id, section_key, content, created_at, created_by, is_current, based_on_id
         FROM site_content_versions WHERE id = ?`,
    )
    .get(id) as VersionRow | undefined;
  if (!row) return null;
  return toVersion(row);
}

/** DB 行 → 契约对象。JSON 坏了就返回 null（跳过这一条） */
function toVersion(r: VersionRow): SiteContentVersion | null {
  let content: unknown;
  try {
    content = JSON.parse(r.content);
  } catch {
    /* JSON 损坏 → 这条版本读不出来，跳过 */
    return null;
  }
  return {
    id: r.id,
    key: r.section_key,
    content,
    createdAt: r.created_at,
    createdBy: r.created_by,
    isCurrent: r.is_current === 1,
    basedOnId: r.based_on_id ?? null,
  };
}

/**
 * 迁移回填 —— 给「site_content 已有行、但版本表里没有这个 key」的
 * 老部署补一条基线版本。
 *
 * 为什么需要：老部署的 site_content 行是**唯一**的内容快照，没有任何
 * 版本记录。后台历史页第一次打开会是空的，看起来像「从没改过」——
 * 其实改过。补一条基线版本（created_at 取原 updated_at，created_by
 * 取原 updated_by），历史才是真的。
 *
 * 幂等：只补「一个版本都没有」的 key，补过就不再补。重复启动安全。
 */
export function backfillSiteContentVersions(): void {
  const rows = db
    .prepare(
      `SELECT sc.section_key, sc.content, sc.updated_at, sc.updated_by
         FROM site_content sc
        WHERE NOT EXISTS (
          SELECT 1 FROM site_content_versions v WHERE v.section_key = sc.section_key
        )`,
    )
    .all() as {
    section_key: SiteSectionKey;
    content: string;
    updated_at: string;
    updated_by: string | null;
  }[];
  if (rows.length === 0) return;
  inTransaction(() => {
    for (const r of rows) {
      /* 内容坏掉的老行不补 —— 补了也是一条读不出来的版本 */
      try {
        JSON.parse(r.content);
      } catch {
        continue;
      }
      db.prepare(
        `INSERT INTO site_content_versions
           (section_key, content, created_at, created_by, is_current, based_on_id)
         VALUES (?, ?, ?, ?, 1, NULL)`,
      ).run(r.section_key, r.content, r.updated_at, r.updated_by);
    }
  });
}

/* ============================================================
   结构校验 —— 手写类型守卫
   ------------------------------------------------------------------
   不引 zod：依赖表面小、形状稳定；手写守卫可读性更高。
   任何字段不匹配 → 抛 invalid_section_shape，detail 含失败原因。
   ============================================================ */

const isStr = (v: unknown): v is string => typeof v === "string";
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isBool = (v: unknown): v is boolean => typeof v === "boolean";
const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const isArr = (v: unknown): v is unknown[] => Array.isArray(v);
const isStrArr = (v: unknown): v is string[] =>
  isArr(v) && v.every(isStr);

/**
 * photoId —— 可选字段的校验。
 *
 * 后台「从公开相册选图」把它写进内容里（存 photoId 不存签名 URL：
 * 签名 URL 900 秒就过期，存进 DB 等于存了个定时炸弹）。没选图时
 * 字段整体不出现（undefined）或显式为 null（= 用兜底图）。
 *
 * ⚠️ 只对**出现时**的值提要求，不出现不算错 —— 老内容（选图功能
 *    上线前写入的）没有这个字段，仍要能被读回来。
 */
const isOptionalPhotoId = (v: unknown): boolean =>
  v === undefined || v === null || isStr(v);

function isCta(v: unknown): boolean {
  return isObj(v) && isStr(v.label) && isStr(v.href);
}
function isMetaRow(v: unknown): boolean {
  return isObj(v) && isStr(v.label) && isStr(v.value);
}

/** Hero：tags[] + titleLines[2] + image + imageAlt + sub + cta + caption + meta[4]（photoId 可选） */
function isHero(v: unknown): boolean {
  if (!isObj(v)) return false;
  return (
    isStrArr(v.tags) &&
    isArr(v.titleLines) &&
    v.titleLines.length === 2 &&
    v.titleLines.every(isStr) &&
    isStr(v.image) &&
    isOptionalPhotoId(v.photoId) &&
    isStr(v.imageAlt) &&
    isStr(v.sub) &&
    isCta(v.cta) &&
    isStr(v.caption) &&
    isArr(v.meta) &&
    v.meta.length === 4 &&
    v.meta.every(isMetaRow)
  );
}

/** About：kicker + titleLines[] + titleEmphasisIndex + ledeTop + ledeHighlight + portrait + portraitAlt + portraitCap + exhibitions[] + press[] + cta + ctaSecondary（photoId 可选） */
function isAbout(v: unknown): boolean {
  if (!isObj(v)) return false;
  const isYearTextArr = (x: unknown) =>
    isArr(x) &&
    x.every(
      (it) => isObj(it) && isStr(it.year) && isStr(it.text),
    );
  return (
    isStr(v.kicker) &&
    isStrArr(v.titleLines) &&
    isNum(v.titleEmphasisIndex) &&
    isStr(v.ledeTop) &&
    isStr(v.ledeHighlight) &&
    isStr(v.portrait) &&
    isOptionalPhotoId(v.photoId) &&
    isStr(v.portraitAlt) &&
    isStr(v.portraitCap) &&
    isYearTextArr(v.exhibitions) &&
    isYearTextArr(v.press) &&
    isCta(v.cta) &&
    isStr(v.ctaSecondary)
  );
}

/** Subscribe：kicker + titleLines[] + copy + placeholder + button + success */
function isSubscribe(v: unknown): boolean {
  if (!isObj(v)) return false;
  return (
    isStr(v.kicker) &&
    isStrArr(v.titleLines) &&
    isStr(v.copy) &&
    isStr(v.placeholder) &&
    isStr(v.button) &&
    isStr(v.success)
  );
}

/** Story：tag + titleMain + titleSub + image + imageAlt + copy + cta + caption + meta[4]（photoId 可选） */
function isStory(v: unknown): boolean {
  if (!isObj(v)) return false;
  return (
    isStr(v.tag) &&
    isStr(v.titleMain) &&
    isStr(v.titleSub) &&
    isStr(v.image) &&
    isOptionalPhotoId(v.photoId) &&
    isStr(v.imageAlt) &&
    isStr(v.copy) &&
    isCta(v.cta) &&
    isStr(v.caption) &&
    isArr(v.meta) &&
    v.meta.length === 4 &&
    v.meta.every(isMetaRow)
  );
}

/** Footer：line + columns[{kicker, lines:(string|{text,href})[]}] + bottom[] */
function isFooter(v: unknown): boolean {
  if (!isObj(v)) return false;
  const isColumn = (x: unknown) =>
    isObj(x) &&
    isStr(x.kicker) &&
    isArr(x.lines) &&
    x.lines.every(
      (l: unknown) =>
        isStr(l) || (isObj(l) && isStr(l.text) && isStr(l.href)),
    );
  return (
    isStr(v.line) &&
    isArr(v.columns) &&
    v.columns.every(isColumn) &&
    isStrArr(v.bottom)
  );
}

/** Interlude01：kicker + quote[] + emphasisIndex + sig */
function isInterlude01(v: unknown): boolean {
  if (!isObj(v)) return false;
  return (
    isStr(v.kicker) &&
    isStrArr(v.quote) &&
    v.quote.length > 0 &&
    isNum(v.emphasisIndex) &&
    isStr(v.sig)
  );
}

/** Interlude03：kicker + quote[] + sig（无 emphasisIndex） */
function isInterlude03(v: unknown): boolean {
  if (!isObj(v)) return false;
  return (
    isStr(v.kicker) && isStrArr(v.quote) && v.quote.length > 0 && isStr(v.sig)
  );
}

/** Coords：kicker + rows[{no, place, a, b, time}] + sig */
function isCoords(v: unknown): boolean {
  if (!isObj(v)) return false;
  const isRow = (x: unknown) =>
    isObj(x) &&
    isStr(x.no) &&
    isStr(x.place) &&
    isStr(x.a) &&
    isStr(x.b) &&
    isStr(x.time);
  return (
    isStr(v.kicker) &&
    isArr(v.rows) &&
    v.rows.length > 0 &&
    v.rows.every(isRow) &&
    isStr(v.sig)
  );
}

/** WorksIntro：kicker + titleLines[] + titleSuffix + intro + frameHint */
function isWorksIntro(v: unknown): boolean {
  if (!isObj(v)) return false;
  return (
    isStr(v.kicker) &&
    isStrArr(v.titleLines) &&
    v.titleLines.length > 0 &&
    isStr(v.titleSuffix) &&
    isStr(v.intro) &&
    isStr(v.frameHint)
  );
}

/**
 * Series：作品系列数组（5 组）。
 *
 * 每项 10 个必需字段 + 可选的 photoId。`image` 的语义是**兜底图** ——
 * lib/series-covers 在 server 层会把 image/imageAlt 替换成 COS 签名
 * URL（当对应 album 有公开封面时）；取不到才用这里的值。所以 admin
 * 改 image 只影响"COS 封面取不到"的兜底场景。
 */
function isSeries(v: unknown): boolean {
  if (!isArr(v) || v.length === 0) return false;
  return v.every((it) => {
    if (!isObj(it)) return false;
    return (
      isStr(it.key) &&
      it.key.length > 0 &&
      isStr(it.albumSlug) &&
      isStr(it.no) &&
      isStr(it.name) &&
      isStr(it.meta) &&
      isStr(it.note) &&
      isStr(it.image) &&
      isOptionalPhotoId(it.photoId) &&
      isStr(it.imageAlt) &&
      isStr(it.figLabel) &&
      isStr(it.figCaption)
    );
  });
}

/**
 * Site：站点 meta 的可编辑部分（**不含 locale**）。
 *
 * locale 被排除 —— 它用于 `<html lang>`，写在 app/layout.tsx 的
 * RootLayout 组件体里；那处读 DB 会让 layout 变 dynamic，把 /album
 * 的 force-static 一起传染。见 lib/contracts.ts 的 SiteContentData。
 *
 * ⚠️ 键集合**严格相等**（不多不少）—— 只校验必需字段的话，admin 传
 * 额外的 `locale` 会被静默存进 DB 并原样返回：类型上说不含 locale、
 * 运行时却有，是个死值（`<html lang>` 仍读静态值）+ 误导。严格校验
 * 让 admin 传 locale 直接收到 400，边界清楚。
 */
const SITE_KEYS = [
  "name",
  "nameEn",
  "title",
  "description",
  "projectName",
  "edition",
  "foundedYear",
  "cities",
  "marquee",
] as const;

function isSite(v: unknown): boolean {
  if (!isObj(v)) return false;
  const keys = Object.keys(v);
  if (keys.length !== SITE_KEYS.length) return false;
  if (!keys.every((k) => (SITE_KEYS as readonly string[]).includes(k))) {
    return false;
  }
  return (
    isStr(v.name) &&
    v.name.length > 0 &&
    isStr(v.nameEn) &&
    isStr(v.title) &&
    isStr(v.description) &&
    isStr(v.projectName) &&
    isNum(v.edition) &&
    isNum(v.foundedYear) &&
    isStrArr(v.cities) &&
    isStrArr(v.marquee) &&
    v.marquee.length === 2
  );
}

/**
 * Nav：items[{label, href}] 数组。
 *
 * ⚠️ href 必须过安全白名单 —— React 的 href 属性**不阻止**
 * `javascript:` URL（admin 写进去，访客一点就执行）。允许两种：
 *   - `#anchor`：页内锚点，anchor 必须在已知 section id 里
 *   - `/path`  ：站内绝对路径（单斜杠）
 *
 * `//evil.com` 是协议相对 URL（指向外站），显式排除。
 */
function isNav(v: unknown): boolean {
  if (!isArr(v)) return false;
  return v.every((it) => {
    if (!isObj(it)) return false;
    if (!isStr(it.label) || it.label.length === 0) return false;
    if (!isStr(it.href)) return false;
    return isSafeNavHref(it.href);
  });
}

/** href 安全白名单校验 —— 与 lib/data/nav.ts 的 NAV_ANCHORS 对齐 */
function isSafeNavHref(href: string): boolean {
  if (href.startsWith("//")) return false; // 协议相对 URL → 外站
  if (href.startsWith("#")) {
    const anchor = href.slice(1);
    return (NAV_ANCHORS as readonly string[]).includes(anchor);
  }
  if (href.startsWith("/")) return true; // 站内绝对路径
  return false; // 其余（相对路径 / javascript: / data:）一律拒绝
}

/** 总入口：按 key 路由到对应守卫 */
export function isValidSection(
  key: SiteSectionKey,
  v: unknown,
): boolean {
  switch (key) {
    case "hero":
      return isHero(v);
    case "about":
      return isAbout(v);
    case "subscribe":
      return isSubscribe(v);
    case "footer":
      return isFooter(v);
    case "story":
      return isStory(v);
    case "nav":
      return isNav(v);
    case "interlude01":
      return isInterlude01(v);
    case "interlude03":
      return isInterlude03(v);
    case "coords":
      return isCoords(v);
    case "worksIntro":
      return isWorksIntro(v);
    case "site":
      return isSite(v);
    case "series":
      return isSeries(v);
  }
}