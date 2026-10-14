import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * 站点是 `next start` 跑的 Node 进程（合并了原签名服务），
   * 不再是静态导出。所有 `/api/*` 走 Route Handler，需要服务端运行时。
   */

  images: {
    /**
     * 必须开。原静态导出没有图片优化服务，
     * `next/image` 用默认 loader 会与 server output 冲突。开了之后退化成普通 <img>，
     * 图源本身（Unsplash / COS）已经带了缩放参数，不损失什么。
     */
    unoptimized: true,
  },

  /* ---- 纯中文站，关闭自动 locale 前缀 ---- */
  trailingSlash: false,
};

export default nextConfig;
