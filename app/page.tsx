import Nav from "@/components/Nav";
import MetaBar from "@/components/MetaBar";
import HeroSection from "@/components/home/HeroSection";
import JournalSection from "@/components/home/JournalSection";
import WorksSection from "@/components/home/WorksSection";
import CoordsSection from "@/components/home/CoordsSection";
import StorySection from "@/components/home/StorySection";
import Interlude03Section from "@/components/home/Interlude03Section";
import AboutSection from "@/components/home/AboutSection";
import SubscribeSection from "@/components/home/SubscribeSection";
import FooterSection from "@/components/home/FooterSection";
import { ImageFallbackProvider } from "@/components/Works";
import { series as seriesData } from "@/lib/data/home";
import { enrichSeriesWithCovers } from "@/lib/series-covers";
import { listHomeContent } from "@/lib/data/site-content";

/**
 * 视觉节奏（严格遵循「影像—留白—文字—影像」）：
 *  01 HERO      满屏影像
 *  02 手记 01   浅色留白 · 文字
 *  03 WORKS     深底 · 单图目录（每屏仅一张主图）—— 封面图从 COS 真实拉
 *  04 手记 02   最深冷黑 · 坐标表
 *  05 STORY     满屏影像（视觉高潮）
 *  06 手记 03   浅色留白 · 大留白
 *  07 ABOUT     浅色双栏
 *  08 SUBSCRIBE 浅纸色
 *  09 FOOTER    最深冷黑
 */

/* 动态渲染：页面包含 Nav（读 cookies），cookies() 强制整个 page 走
   dynamic，ISR/force-static 与之互斥。后台保存 → PUT 路径调
   revalidatePath('/') 让下次请求立刻重渲（lib/admin-api/site-content.ts）。
   revalidate 在 force-dynamic 下是 no-op，保留仅为语义明确。 */
export const dynamic = "force-dynamic";
export const revalidate = 60;

export default async function Home() {
  /**
   * 作品集 5 组的封面：只从主管理员上传的照片里挑。
   *
   *   1. album.coverKey —— admin 在后台「设封面」明确指定的 photo
   *   2. 兜底 —— 该 album 下属于主管理员 + isPublic + 非回收站的第一张
   *
   * 用 getFirstAdminId() 卡"主页封面只属于 admin"：viewer 上传
   * 的 isPublic 图不影响首页。coverKey 只能 admin 改（PUT /api/album
   * 要 admin），所以即使 viewer 上传图到 5 个 series 对应的 album，也
   * 不会被首页默认当封面。
   *
   * 任一步失败（manifest 读不出 / 找不到 admin / 找不到 album / 找不
   * 到 photo / COS 签失败）都静默用原 image 兜底，首屏永远不白。
   */
  const series = await enrichSeriesWithCovers(seriesData);

  /* 首期 10 section 走 DB；其他 section 仍用同步常量。后续会推广。 */
  const home = await listHomeContent();

  return (
    <>
      <ImageFallbackProvider />
      <Nav />
      <MetaBar marquee={home.site.marquee} />

      <main>
        <HeroSection data={home.hero} />
        <JournalSection data={home.interlude01} />
        <WorksSection series={series} intro={home.worksIntro} />
        <CoordsSection data={home.coords} />
        <StorySection data={home.story} />
        <Interlude03Section data={home.interlude03} />
        <AboutSection data={home.about} />
        <SubscribeSection data={home.subscribe} />
      </main>

      <FooterSection data={home.footer} siteName={home.site.name} />
    </>
  );
}