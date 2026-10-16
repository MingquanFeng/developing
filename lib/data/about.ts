/**
 * 关于摄影师数据
 * ------------------------------------------------------------------
 * 第七节 AboutSection 用。包括 lede、展览、媒体、CTA。
 */

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
