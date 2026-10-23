/**
 * 后台「站点内容」的块清单 —— 单一事实来源
 * ------------------------------------------------------------------
 * 数组的**顺序**就是首页的自上而下顺序：顶栏两块 → 九幕 → 页脚。
 * 用户是看着首页找内容的，后台列表就该跟页面顺序一致，而不是按
 * 「哪个先做出来的」排（早期版本就是按开发顺序排的：hero/about/
 * subscribe/footer 之后接一大串，看不出页面结构）。
 *
 * label / hint 是展示文案（每块叫什么、里面是什么）—— 放在这儿是因为
 * 它和顺序是同一份东西，拆开就会漂。
 *
 * ⚠️ app/page.tsx 的渲染顺序必须与这里一致 —— lib/site-sections.test.ts
 *   会读那个文件来核对，对不上就红。改页面顺序时记得一起改这里。
 */
import type { SiteSectionKey } from "@/lib/contracts";

export type SiteSectionMeta = {
  key: SiteSectionKey;
  label: string;
  hint: string;
};

export const SITE_SECTIONS: ReadonlyArray<SiteSectionMeta> = [
  /* ---------- 顶栏 ---------- */
  {
    key: "nav",
    label: "顶导航",
    hint: "内容项文案与链接",
  },
  {
    key: "site",
    label: "站点 meta",
    hint: "标题 / 描述 / 品牌名 / 跑马灯（影响 SEO）",
  },
  /* ---------- 九幕 ---------- */
  {
    key: "hero",
    label: "首屏 HERO",
    hint: "满屏肖像 + 大字标题 + 四栏元信息",
  },
  {
    key: "interlude01",
    label: "第二幕 · 手记 01",
    hint: "关于面孔 · 引文 + 强调行",
  },
  {
    key: "worksIntro",
    label: "第三幕 · 人像志介绍",
    hint: "WORKS 顶部标题与文案",
  },
  {
    key: "series",
    label: "第三幕 · 作品系列",
    hint: "5 组系列的文案（封面图另在「封面管理」设）",
  },
  {
    key: "coords",
    label: "第四幕 · 手记 02",
    hint: "对象与坐标表（可增删行）",
  },
  {
    key: "story",
    label: "第五幕 · 主推故事",
    hint: "满屏肖像 + 副标 + 阅读入口",
  },
  {
    key: "interlude03",
    label: "第六幕 · 手记 03",
    hint: "工作方法 · 引文",
  },
  {
    key: "about",
    label: "第七幕 · 关于",
    hint: "摄影师介绍、双栏 + 展览 / 出版",
  },
  {
    key: "subscribe",
    label: "第八幕 · 订阅",
    hint: "newsletter 表单",
  },
  {
    key: "footer",
    label: "第九幕 · 页脚",
    hint: "三栏 + 底栏",
  },
];
