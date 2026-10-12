import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* ---- 静态导出（供 website_deploy 使用） ---- */
  output: "export",

  images: {
    /**
     * 必须开。静态导出没有图片优化服务，
     * next/image 用默认 loader 会在 next dev 下抛
     * "Image Optimization using the default loader is not compatible with output: 'export'"。
     * 开了之后 <Image> 退化成普通 <img>，src 原样输出 ——
     * 图源本身（Unsplash / COS）已经带了缩放参数，不损失什么。
     */
    unoptimized: true,
  },

  /* ---- 纯中文站，关闭自动 locale 前缀 ---- */
  trailingSlash: true,
};

export default nextConfig;
