import Nav from "@/components/Nav";
import MetaBar from "@/components/MetaBar";
import Hero from "@/components/Hero";
import Interlude from "@/components/Interlude";
import Works, { ImageFallbackProvider } from "@/components/Works";
import Coords from "@/components/Coords";
import Story from "@/components/Story";
import About from "@/components/About";
import Subscribe from "@/components/Subscribe";
import Footer from "@/components/Footer";
import { interlude01, interlude03 } from "@/lib/data";

/**
 * 视觉节奏（严格遵循「影像—留白—文字—影像」）：
 *  01 HERO      满屏影像
 *  02 手记 01   浅色留白 · 文字
 *  03 WORKS     深底 · 单图目录（每屏仅一张主图）
 *  04 手记 02   最深冷黑 · 坐标表
 *  05 STORY     满屏影像（视觉高潮）
 *  06 手记 03   浅色留白 · 大留白
 *  07 ABOUT     浅色双栏
 *  08 SUBSCRIBE 浅纸色
 *  09 FOOTER    最深冷黑
 */
export default function Home() {
  return (
    <>
      <ImageFallbackProvider />
      <Nav />
      <MetaBar />

      <main>
        <Hero />
        <Interlude
          id="journal"
          kicker={interlude01.kicker}
          lines={interlude01.quote}
          emphasisIndex={interlude01.emphasisIndex}
          sig={interlude01.sig}
        />
        <Works />
        <Coords />
        <Story />
        <Interlude
          kicker={interlude03.kicker}
          lines={interlude03.quote}
          small
          variant="minimal"
        />
        <About />
        <Subscribe />
      </main>

      <Footer />
    </>
  );
}
