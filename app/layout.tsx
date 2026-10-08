import type { Metadata, Viewport } from "next";
import {
  Bodoni_Moda,
  Inter,
  Space_Mono,
  Noto_Serif_SC,
  Noto_Sans_SC,
} from "next/font/google";
import "./globals.css";
import { site } from "@/lib/data";

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

/* ---------- SEO ---------- */
export const metadata: Metadata = {
  metadataBase: new URL("https://v4ntwd7b2tylv.space.mcode.cn"),
  title: {
    default: site.title,
    template: `%s — ${site.name}`,
  },
  description: site.description,
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
  authors: [{ name: site.name }],
  creator: site.name,
  openGraph: {
    type: "website",
    locale: "zh_CN",
    siteName: site.name,
    title: site.title,
    description: site.description,
  },
  twitter: {
    card: "summary_large_image",
    title: site.title,
    description: site.description,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  themeColor: "#1C1E22",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
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
