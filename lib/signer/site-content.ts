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
import { db } from "./_db";
import type { SiteSectionKey } from "@/lib/contracts";

export type { SiteSectionKey } from "@/lib/contracts";

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
  }
}