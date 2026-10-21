import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import {
  Bodoni_Moda,
  Inter,
  Space_Mono,
  Noto_Serif_SC,
  Noto_Sans_SC,
} from "next/font/google";
import "./globals.css";
import { site } from "@/lib/data";
import { getSiteMeta } from "@/lib/data/site-content";

/* ---------- 字体 ---------- */
const bodoni = Bodoni_Moda({
  variable: "--font-bodoni",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  display: "swap",
});

const spaceMono = Space_Mono({
  variable: "--font-space-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

const serifSC = Noto_Serif_SC({
  variable: "--font-serif-sc",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const sansSC = Noto_Sans_SC({
  variable: "--font-sans-sc",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  display: "swap",
});

/* ---------- SEO ----------
   metadata 走 async generateMetadata()，从 SQLite 读 site 覆盖值
   （admin 后台可改 title / description / name）。回落 lib/data/site 静态
   默认。

   ⚠️ 只把 metadata 做成动态，RootLayout 组件体**不读 DB** ——
   那会让 layout 变 dynamic，把 /album 的 force-static（构建期烘
   manifest）一起传染。`<html lang>` 因此仍用静态 site.locale
   （locale 刻意不进 DB，见 lib/contracts.ts 的 SiteContentData）。 */
export async function generateMetadata(): Promise<Metadata> {
  const s = await getSiteMeta();
  return {
    metadataBase: new URL("https://v4ntwd7b2tylv.space.mcode.cn"),
    title: {
      default: s.title,
      template: `%s — ${s.name}`,
    },
    description: s.description,
    keywords: [
      "人像摄影",
      "肖像摄影",
      "先锋摄影",
      "银盐",
      "上海摄影师",
      "北京摄影师",
      "大理摄影师",
      "塞上空许",
    ],
    authors: [{ name: s.name }],
    creator: s.name,
    openGraph: {
      type: "website",
      locale: "zh_CN",
      siteName: s.name,
      title: s.title,
      description: s.description,
    },
    twitter: {
      card: "summary_large_image",
      title: s.title,
      description: s.description,
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#1C1E22",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang={site.locale}
      className={[
        bodoni.variable,
        inter.variable,
        spaceMono.variable,
        serifSC.variable,
        sansSC.variable,
      ].join(" ")}
    >
      <body>{children}</body>
    </html>
  );
}
