/**
 * 版本摘要 —— summarizeSection 单测
 * ------------------------------------------------------------------
 * 核心不变量：**永远不抛异常，永远返回字符串**。
 * content 的类型是 unknown —— 后端存的是 JSON，形状只靠写入时保证。
 * 任何形状不对都必须退成「—」，而不是把整个版本列表炸掉。
 */
import { describe, expect, it } from "vitest";
import { summarizeSection } from "./site-content-summary";

describe("summarizeSection", () => {
  it("hero —— 两行标题拼起来", () => {
    expect(
      summarizeSection("hero", { titleLines: ["至静", "之极"] }),
    ).toBe("至静 / 之极");
  });

  it("about —— titleLines 首行", () => {
    expect(
      summarizeSection("about", { titleLines: ["一间关于", "面孔"] }),
    ).toBe("一间关于");
  });

  it("subscribe —— titleLines[0]", () => {
    expect(
      summarizeSection("subscribe", { titleLines: ["一年四封，", "寄给"] }),
    ).toBe("一年四封，");
  });

  it("story —— titleMain", () => {
    expect(summarizeSection("story", { titleMain: "静蓝" })).toBe("静蓝");
  });

  it("footer —— line", () => {
    expect(
      summarizeSection("footer", { line: "一位先锋人像摄影师。" }),
    ).toBe("一位先锋人像摄影师。");
  });

  it("site —— title", () => {
    expect(summarizeSection("site", { title: "塞上空许 — 至静之极" })).toBe(
      "塞上空许 — 至静之极",
    );
  });

  it("nav —— N 个导航项", () => {
    expect(summarizeSection("nav", [{}, {}, {}])).toBe("3 个导航项");
  });

  it("coords —— N 行坐标", () => {
    expect(summarizeSection("coords", { rows: [{}, {}] })).toBe("2 行坐标");
  });

  it("series —— N 组系列", () => {
    expect(summarizeSection("series", [{}, {}, {}, {}, {}])).toBe(
      "5 组系列",
    );
  });

  it("interlude01 / interlude03 —— kicker", () => {
    expect(summarizeSection("interlude01", { kicker: "— 手记 01" })).toBe(
      "— 手记 01",
    );
    expect(summarizeSection("interlude03", { kicker: "— 手记 03" })).toBe(
      "— 手记 03",
    );
  });

  it("worksIntro —— titleLines 拼接", () => {
    expect(
      summarizeSection("worksIntro", { titleLines: ["精选", "人像"] }),
    ).toBe("精选 人像");
  });

  it("字段缺失 → 「—」", () => {
    expect(summarizeSection("hero", {})).toBe("—");
    expect(summarizeSection("story", {})).toBe("—");
    expect(summarizeSection("site", { title: "" })).toBe("—");
    expect(summarizeSection("nav", [])).toBe("—");
    expect(summarizeSection("coords", { rows: [] })).toBe("—");
    expect(summarizeSection("series", [])).toBe("—");
  });

  it("content 不是对象 / 是 null / 是数组 → 「—」，不抛异常", () => {
    expect(summarizeSection("hero", null)).toBe("—");
    expect(summarizeSection("hero", undefined)).toBe("—");
    expect(summarizeSection("hero", 42)).toBe("—");
    expect(summarizeSection("hero", ["x"])).toBe("—");
    expect(summarizeSection("story", "不是对象")).toBe("—");
  });

  it("字段类型不对（数组里混了非字符串）→ 只取字符串", () => {
    expect(
      summarizeSection("hero", { titleLines: ["至静", 42, "之极"] }),
    ).toBe("至静 / 之极");
  });
});
