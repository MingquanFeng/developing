/**
 * 首页内容版本摘要
 * ------------------------------------------------------------------
 * 版本列表里每一条都要显示"这一版大概是什么"，但版本的 content 类型是
 * unknown —— 后端存的是 JSON，形状只靠"当初写进去的什么"保证，前端
 * 没有任何静态保证。
 *
 * 所以这里所有取字段的路径都走"取不到就退下"：形状不对、非对象、
 * 字段缺失，一律返回「—」，绝不抛异常把整个列表炸掉。
 *
 * 纯函数（无 React / DOM 依赖）—— 抽到 lib/ 是为了能进 vitest 的
 * include 范围（lib 目录下的 .test.ts）。
 */
import type { SiteSectionKey } from "./contracts";

/** 取对象上的一个字段；content 不是普通对象 → undefined */
function pickField(content: unknown, field: string): unknown {
  if (typeof content !== "object" || content === null || Array.isArray(content)) {
    return undefined;
  }
  return (content as Record<string, unknown>)[field];
}

/** 取字符串字段；非字符串 / 空串 → null */
function pickString(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

/** 取字符串数组字段；不是数组 → 空数组 */
function pickStringArray(content: unknown, field: string): string[] {
  const v = pickField(content, field);
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
}

/**
 * 按块给一句内容摘要。
 * ------------------------------------------------------------------
 * 约定：
 *   hero       两行标题拼起来
 *   about      titleLines 首行
 *   subscribe  titleLines[0]
 *   story      titleMain
 *   footer     line
 *   site       title
 *   nav        N 个导航项
 *   coords     N 行坐标
 *   series     N 组系列
 *   interlude  kicker
 *   worksIntro titleLines 拼接
 */
export function summarizeSection(
  key: SiteSectionKey,
  content: unknown,
): string {
  try {
    switch (key) {
      case "hero": {
        const lines = pickStringArray(content, "titleLines");
        return lines.length ? lines.join(" / ") : "—";
      }
      case "about": {
        const lines = pickStringArray(content, "titleLines");
        return lines[0] ?? "—";
      }
      case "subscribe": {
        const lines = pickStringArray(content, "titleLines");
        return lines[0] ?? "—";
      }
      case "footer":
        return pickString(pickField(content, "line")) ?? "—";
      case "story":
        return pickString(pickField(content, "titleMain")) ?? "—";
      case "nav": {
        const n = Array.isArray(content) ? content.length : 0;
        return n ? `${n} 个导航项` : "—";
      }
      case "interlude01":
      case "interlude03":
        return pickString(pickField(content, "kicker")) ?? "—";
      case "coords": {
        const rows = pickField(content, "rows");
        const n = Array.isArray(rows) ? rows.length : 0;
        return n ? `${n} 行坐标` : "—";
      }
      case "worksIntro": {
        const lines = pickStringArray(content, "titleLines");
        return lines.length ? lines.join(" ") : "—";
      }
      case "site":
        return pickString(pickField(content, "title")) ?? "—";
      case "series": {
        const n = Array.isArray(content) ? content.length : 0;
        return n ? `${n} 组系列` : "—";
      }
      default:
        return "—";
    }
  } catch {
    /* 兜底：摘要永远不该把列表炸掉 */
    return "—";
  }
}
