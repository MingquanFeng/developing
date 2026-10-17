/**
 * 首页正文文案（首屏 + 五系列 + 坐标表 + 订阅）
 * ------------------------------------------------------------------
 * 第一节 hero —— HeroSection 用
 * interlude01/03 —— journal 与手记 03 用
 * series + worksIntro + FALLBACK_IMAGES —— WorksSection 用
 * coords —— CoordsSection（手记 02）用
 *
 * 改字段务必小心：series 的 `image/imageAlt` 在构建期会被
 * lib/series-covers 替换成 COS 签名 URL。如果改默认值（比如换 Unsplash
 * 图片），记得回访 __snapshots__ 看一眼产物里有没有意外。
 */

/* ========== 首屏 ========== */
export const hero = {
  tags: ["A — 47 / 主推", "人像志 · 2024"],
  titleLines: ["至静", "之极"],
  image:
    "https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?w=2400&q=80&auto=format&fit=crop",
  imageAlt: "对象 01 · 上海弄堂 · 凌晨",
  sub: "一份关于面孔、凝视与沉默的视觉志——2022 至 2024 年间，对十一位对象的长期肖像拍摄。",
  cta: { label: "查看作品", href: "#works" },
  caption: "对象 01 — 上海弄堂 · 凌晨",
  meta: [
    { label: "摄影师", value: "塞上空许" },
    { label: "对象", value: "11 位" },
    { label: "格式", value: "35MM · 中画幅" },
    { label: "版本", value: "47" },
  ],
} as const;

/* ========== 文字间奏 ========== */
export const interlude01 = {
  kicker: "— 手记 01 / 关于面孔",
  quote: [
    "肖像是一种",
    "互相交还的功课——",
    "对象交出三分钟的",
    "沉默，你交出",
    "一辈子的注视。",
  ],
  /** 需强调的词：交给 QuoteHighlight 组件 */
  emphasisIndex: 1,
  sig: "— 塞上空许，北京，2024",
} as const;

export const interlude03 = {
  kicker: "— 手记 03 / 工作方法",
  quote: [
    "我不拍摄风景，",
    "不拍摄衣服，",
    "我只拍摄",
    "对象忘记",
    "被观看之前的",
    "那一瞬。",
  ],
  sig: "",
} as const;

/* ========== 五个系列（文字主导目录） ========== */
export const series = [
  {
    key: "shanghai",
    albumSlug: "shanghai-0317",
    no: "01",
    name: "上海 03:17",
    meta: "弄堂 · 2024 · 35MM",
    note: "七位夜行人——凌晨三点十七分，弄堂深处，被陌生人注视，被快门收留。",
    image:
      "https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?w=1600&q=80&auto=format&fit=crop",
    imageAlt: "上海 03:17 — 对象 01",
    figLabel: "001 / 上海 03:17",
    figCaption: "对象 01 · 弄堂 · 凌晨",
  },
  {
    key: "beijing",
    albumSlug: "beijing-sketch",
    no: "02",
    name: "北京素描",
    meta: "胡同工坊 · 2024 · 中画幅",
    note: "五位对象，朝北的窗，五种沉默。每一张都被按停四十秒。",
    image:
      "https://images.unsplash.com/photo-1469334031218-e382a71b716b?w=1600&q=80&auto=format&fit=crop",
    imageAlt: "北京素描 — 对象 02",
    figLabel: "002 / 北京素描",
    figCaption: "对象 02 · 胡同 · 上午",
  },
  {
    key: "mogan",
    albumSlug: "mogan-fog",
    no: "03",
    name: "莫干之雾",
    meta: "莫干山雾林 · 2023 · 35MM",
    note: "七张面孔，七种静默。雾中的对话，关于中国式孤独的素描。",
    image:
      "https://images.unsplash.com/photo-1488161628813-04466f872be2?w=1600&q=80&auto=format&fit=crop",
    imageAlt: "莫干之雾 — 对象 03",
    figLabel: "003 / 莫干之雾",
    figCaption: "对象 03 · 雾林 · 午后",
  },
  {
    key: "lhasa",
    albumSlug: "lhasa-wall",
    no: "04",
    name: "拉萨白墙",
    meta: "西藏高原 · 2023 · 中画幅",
    note: "一面白墙，三千七百米的蓝。十二位对象，每人三分钟。",
    image:
      "https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=1600&q=80&auto=format&fit=crop",
    imageAlt: "拉萨白墙 — 对象 04",
    figLabel: "004 / 拉萨白墙",
    figCaption: "对象 04 · 高原 · 上午",
  },
  {
    key: "dali",
    albumSlug: "dali-indigo",
    no: "05",
    name: "大理静蓝",
    meta: "大理扎染师自宅 · 2024 · 35MM",
    note: "一位对象，六个月。同一面染缸前，按下 47 次快门。",
    image:
      "https://images.unsplash.com/photo-1492288991661-058aa541ff43?w=1600&q=80&auto=format&fit=crop",
    imageAlt: "大理静蓝 — 唯一对象",
    figLabel: "005 / 大理静蓝",
    figCaption: "对象 唯一 · 扎染工坊",
  },
] as const;

export const worksIntro = {
  kicker: "— 第三幕 / 人像志",
  titleLines: ["精选", "人像"],
  titleSuffix: "肖像",
  intro: "五组人像，五个对象，五种凝视。\n悬停或轻触系列名，以显示单张面孔。",
  frameHint: "悬停或轻触系列 → 单张面孔",
} as const;

/* ========== 手记 02：对象与坐标 ========== */
export const coords = {
  kicker: "— 手记 02 / 对象与坐标",
  rows: [
    { no: "N° 01", place: "上海弄堂", a: "对象 · 七位", b: "夜行人", time: "03:17" },
    { no: "N° 02", place: "北京胡同工坊", a: "对象 · 五位", b: "素描", time: "10:00" },
    { no: "N° 03", place: "莫干山雾林", a: "对象 · 七位", b: "静默", time: "14:00" },
    { no: "N° 04", place: "拉萨高原白墙", a: "对象 · 十二位", b: "高原快照", time: "11:00" },
    { no: "N° 05", place: "大理扎染师自宅", a: "对象 · 一位", b: "六个月", time: "06:30" },
  ],
  sig: "每一帧是一组对象，每组对象是一段凝视。",
} as const;

/* ========== 图片失败回退池 ========== */
export const FALLBACK_IMAGES = [
  "https://images.unsplash.com/photo-1488426862026-3ee34a7d66df",
  "https://images.unsplash.com/photo-1469334031218-e382a71b716b",
  "https://images.unsplash.com/photo-1488161628813-04466f872be2",
  "https://images.unsplash.com/photo-1531746020798-e6953c6e8e04",
  "https://images.unsplash.com/photo-1492288991661-058aa541ff43",
  "https://images.unsplash.com/photo-1496747611176-843222e1e57c",
  "https://images.unsplash.com/photo-1503342217505-b0a15ec3261c",
  "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6",
  "https://images.unsplash.com/photo-1517841905240-472988babdf9",
];
