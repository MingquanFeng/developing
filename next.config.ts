import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* ---- 静态导出（供 website_deploy 使用） ---- */
  output: "export",

  /* ---- 允许 next/image 拉取 Unsplash ---- */
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/**",
      },
    ],
    formats: ["image/avif", "image/webp"],
  },

  /* ---- 纯中文站，关闭自动 locale 前缀 ---- */
  trailingSlash: true,
};

export default nextConfig;
