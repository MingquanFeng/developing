/**
 * 站点内容数据源
 * ------------------------------------------------------------------
 * 所有可编辑文案集中在此。将来接 CMS（Sanity / Strapi）时，
 * 只需把本文件替换为 fetch 实现，组件层无需改动。
 */

/* ========== 站点级 ========== */
export const site = {
  name: "塞上空许",
  nameEn: "YAN",
  title: "塞上空许 — 至静之极",
  description:
    "塞上空许 — 先锋人像摄影师，工作于上海、北京、大理。一份关于面孔、凝视与沉默的视觉志。",
  locale: "zh-CN",
  projectName: "developing",
  edition: 47,
  foundedYear: 2014,
  cities: ["上海", "北京", "大理"],
  marquee: [
    "塞上空许工作室 — 上海 ↔ 北京 ↔ 大理",
    "人像志 · 卷 47",
  ],
} as const;

/* ========== 导航 ========== */
export const nav = [
  { label: "作品", href: "#works" },
  { label: "故事", href: "#story" },
  { label: "手记", href: "#journal" },
  { label: "关于", href: "#about" },
  { label: "相册", href: "/album/" },
  { label: "联系", href: "#contact" },
] as const;

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

/* ========== 重点故事 ========== */
export const story = {
  tag: "— 主推故事 / 05",
  titleMain: "静蓝",
  titleSub: "PORTRAIT",
  image:
    "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=2400&q=85&auto=format&fit=crop",
  imageAlt: "大理扎染师肖像",
  copy: "一位大理扎染师，六个月的凝视——在同一面染缸前，按下 47 次快门。把一个人的快门画成一年。",
  cta: { label: "阅读全文", href: "#" },
  caption: "随笔 · 12 分钟 · 中文 / 英文",
  meta: [
    { label: "发布", value: "2024 · 09 · 22" },
    { label: "对象", value: "一位" },
    { label: "快门", value: "47" },
    { label: "跨度", value: "六个月" },
  ],
} as const;

/* ========== 摄影师介绍 ========== */
export const about = {
  kicker: "— 第七幕 / 关于",
  titleLines: ["一间关于", "面孔", "的工作室。"],
  titleEmphasisIndex: 1,
  ledeTop:
    "塞上空许是一位先锋人像摄影师，工作往返于上海、北京与大理之间。自 2014 年起，专注于以中画幅胶片为陌生人造像——",
  ledeHighlight:
    "《新周刊》《GQ 智族》《周末画报》《ID 中国》《时尚芭莎》《嘉人》等刊物拍摄人物肖像",
  portrait:
    "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=1200&q=80&auto=format&fit=crop",
  portraitAlt: "塞上空许肖像",
  portraitCap: "塞上空许，对象 00，大理扎染工坊，2024 年八月。",
  exhibitions: [
    { year: "2024", text: "《面孔》— 三影堂摄影奖，北京" },
    { year: "2023", text: "《大理静蓝》— 成都当代影像馆，成都" },
    { year: "2023", text: "《北京素描》— 上海摄影艺术中心，上海" },
    { year: "2022", text: "《拉萨白墙》— 平遥国际摄影节，山西" },
    { year: "2021", text: "《对象 00》— 香格纳画廊，上海" },
  ],
  press: [
    { year: "2024", text: "《人像志 · 卷 47》— 自出版" },
    { year: "2024", text: "《新周刊》— 第 612 期" },
    { year: "2023", text: "《周末画报》— 2024 春" },
    { year: "2023", text: "《ID 中国》— 面孔" },
    { year: "2022", text: "《GQ 智族》— 春季刊" },
  ],
  cta: { label: "委托肖像", href: "#contact" },
  ctaSecondary: "下载艺术家手册（PDF · 1.2 MB）→",
} as const;

/* ========== 订阅 ========== */
export const subscribe = {
  kicker: "— 通讯 / 来自塞上空许的信",
  titleLines: ["一年四封，", "寄给愿意", "慢下来的人。"],
  copy: "现场笔记、未公开底片，以及偶尔从一间冷工坊寄出的信。没有折扣码，没有新闻稿。",
  placeholder: "your@email",
  button: "订阅 →",
  success: "已收到——下一封信将于下一个节气寄出。",
} as const;

/* ========== 页尾 ========== */
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

/* ========== 章节顺序（用于导航索引计数） ========== */
export const SECTION_IDS = [
  "hero",
  "journal",
  "locations",
  "works",
  "story",
  "about",
  "contact",
] as const;
