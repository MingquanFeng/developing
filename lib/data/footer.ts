/**
 * 页尾数据
 * ------------------------------------------------------------------
 * 第九节 FooterSection 用。三栏布局：工作室 / 代理 / 社交。
 */

export const footer = {
  line: "一位先锋人像摄影师。上海 ↔ 北京 ↔ 大理。第 47 版。",
  columns: [
    {
      kicker: "— 工作室",
      lines: ["上海市普陀区", "M50 艺术区 47 号"],
    },
    {
      kicker: "— 代理",
      lines: [
        "亚洲 · East West Agency",
        "欧洲 · Atelier Booking",
        "媒体 · 《ID 中国》",
      ],
    },
    {
      kicker: "— 社交",
      lines: [
        { text: "Instagram ↗", href: "#" },
        { text: "小红书 ↗", href: "#" },
        { text: "微博 ↗", href: "#" },
        { text: "Vimeo ↗", href: "#" },
      ],
    },
  ],
  bottom: [
    "© 塞上空许工作室 2014 — 2024",
    "以胶片完成，在某个星期二。",
    "回到顶部 ↑",
  ],
} as const;
