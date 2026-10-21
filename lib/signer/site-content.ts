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
import type { SiteSectionKey } from "@/lib/contracts";

export type { SiteSectionKey } from "@/lib/contracts";

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
      section_key TEXT PRIMARY KEY,           -- 'hero' | 'about' | 'subscribe' | 'footer' | 'story' | 'nav' | 'interlude01' | 'interlude03' | 'coords' | 'worksIntro' | 'site'
      content     TEXT NOT NULL,              -- JSON.stringify(content)
      updated_at  TEXT NOT NULL,
      updated_by  TEXT                        -- userId，审计
    );
    CREATE INDEX IF NOT EXISTS idx_site_content_updated ON site_content(updated_at);
  `);
}
ensureSiteContentTable();

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
 * 写入一节内容（覆盖或新增）。
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
 * 删除一节运行时覆盖。下次读取回落静态默认值。
 */
export function resetSiteSection(key: SiteSectionKey): void {
  db.prepare("DELETE FROM site_content WHERE section_key = ?").run(key);
}

/**
 * 首次启动种子：把 lib/data 现有静态值写入。
 * 仅当表为空时执行一次 —— 已有覆盖值的部署不会被覆盖。
 * 用 INSERT OR IGNORE：表为空时逐 key 写，有错（已存在）跳过。
 *
 * 这个函数被 users.ts migrate 末尾调用 —— 跟其他迁移同 lifecycle。
 */
export function seedSiteContentIfEmpty(
  defaults: Readonly<Record<SiteSectionKey, unknown>>,
): void {
  const row = db
    .prepare("SELECT COUNT(*) AS n FROM site_content")
    .get() as { n: number };
  if (row.n > 0) return;
  const now = new Date().toISOString();
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO site_content (section_key, content, updated_at, updated_by)
     VALUES (?, ?, ?, ?)`,
  );
  for (const [key, content] of Object.entries(defaults)) {
    if (!isValidSection(key as SiteSectionKey, content)) {
      /* 形状不匹配 —— 跳过，不污染表 */
      continue;
    }
    stmt.run(key, JSON.stringify(content), now, null);
  }
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

function isCta(v: unknown): boolean {
  return isObj(v) && isStr(v.label) && isStr(v.href);
}
function isMetaRow(v: unknown): boolean {
  return isObj(v) && isStr(v.label) && isStr(v.value);
}

/** Hero：tags[] + titleLines[2] + image + imageAlt + sub + cta + caption + meta[4] */
function isHero(v: unknown): boolean {
  if (!isObj(v)) return false;
  return (
    isStrArr(v.tags) &&
    isArr(v.titleLines) &&
    v.titleLines.length === 2 &&
    v.titleLines.every(isStr) &&
    isStr(v.image) &&
    isStr(v.imageAlt) &&
    isStr(v.sub) &&
    isCta(v.cta) &&
    isStr(v.caption) &&
    isArr(v.meta) &&
    v.meta.length === 4 &&
    v.meta.every(isMetaRow)
  );
}

/** About：kicker + titleLines[] + titleEmphasisIndex + ledeTop + ledeHighlight + portrait + portraitAlt + portraitCap + exhibitions[] + press[] + cta + ctaSecondary */
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

/** Story：tag + titleMain + titleSub + image + imageAlt + copy + cta + caption + meta[4] */
function isStory(v: unknown): boolean {
  if (!isObj(v)) return false;
  return (
    isStr(v.tag) &&
    isStr(v.titleMain) &&
    isStr(v.titleSub) &&
    isStr(v.image) &&
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
  }
}