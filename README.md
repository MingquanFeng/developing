# 塞上空许 — 至静之极

先锋人像摄影师作品集与私人相册。**Next.js 16 + React 19 + CSS Modules**，`output: "export"` 纯静态导出 —— 没有服务器运行时，产物就是一个 `out/` 目录，扔到任何静态托管都能跑。

![技术栈](https://img.shields.io/badge/Next.js-16-black) ![许可证](https://img.shields.io/badge/license-MIT-green)

---

## 特性

- **纯静态**：构建产物是纯 HTML/CSS/JS，零服务端成本
- **响应式作品集**：单页多幕式滚动，暗房人像主题
- **相册浏览**：`/album` 瀑布网格 + 全屏灯箱，键盘 `←` `→` 翻页、`Esc` 退出，支持触摸滑动
- **真·原始宽高比**：每张照片按自身比例占位，竖图横图混排不裁切
- **为 COS 而生**：图片 URL 构造器兼容腾讯云对象存储的数据万象实时处理（`imageMogr2`），接上传功能只需换一个数据源

## 快速开始

```bash
npm install
npm run dev          # 注意：见下方「已知问题」，建议加 --webpack
```

打开 <http://localhost:3000>，导航里点「相册」进入 `/album`。

### 构建

```bash
npm run build        # 产出 out/ 静态目录
```

## 项目结构

```
app/
  layout.tsx           字体注入、站点 metadata
  page.tsx             主页（九幕式作品集）
  album/page.tsx       相册页
components/
  album/AlbumBrowser   筛选条 + 瀑布网格 + 灯箱状态
  album/Lightbox       全屏看片
  lib/data.ts          全站文案与作品数据（唯一内容源）
  lib/album-types.ts   相册类型 + 图片 URL 构造器
  lib/album-client.ts   相册清单数据源（构建期取数 + 运行时刷新）
docs/
  PRD.md               相册功能的产品需求文档
  MVP-PLAN.md          实施方案与任务拆解
```

## 接腾讯云 COS

`lib/album-types.ts` 里的 `buildImageUrls(key)` 已经是双模式的：

```ts
// key 是完整 URL → 走对方的缩放参数
// key 是对象键   → 走 COS 数据万象 imageMogr2
```

清单来自签名服务的 `GET /api/album`，取数走两条路：

- **构建期**取一次，烘进静态 HTML —— 首屏直接有图，SEO 也能抓到
- **页面加载后**再刷新一次 —— 新上传的照片刷新就能看到，不必重新部署

签名服务不可达时降级为空态并给出重试，不会让构建失败。

缩略图与预览图由数据万象按 `imageMogr2` 参数实时处理，原图不受影响。图片 URL 构造器 `lib/album-types.ts` 的 `buildImageUrls(key)` 是双模式的：key 是完整 URL 就走对方的缩放参数，是对象键就走 COS 的 `imageMogr2`。

> 完整的存储桶配置（分前缀 ACL、CORS、数据万象开通、最小权限 CAM 策略）见
> [`docs/MVP-PLAN.md`](./docs/MVP-PLAN.md)。

## 已知问题

| 问题 | 说明 |
| --- | --- |
| `next build` 走 Turbopack 会失败 | 报 `Can't resolve '@vercel/turbopack-next/internal/font/google/font'`。改用 `npx next build --webpack` 即可。 |
| `tsc --noEmit` 可能报 `LayoutProps<"/">` 约束错误 | Next 生成的 `.next/dev/types` 与 `.next/types` 两份全局路由类型冲突。`next build` 不受影响，部署正常。 |
| 图片尺寸元数据必须准确 | 网格按 `height/width` 算单元高度，比例对不上会导致裁切或留边。接 COS 后应由服务端读取图片元数据写入，**不要由前端传**。 |

## 技术栈

| | |
| --- | --- |
| 框架 | Next.js 16.3.7（App Router，静态导出） |
| UI | React 19.2.8 + CSS Modules |
| 字体 | Bodoni Moda / Inter / Space Mono / Noto Serif SC / Noto Sans SC（`next/font/google`） |
| 存储 | 腾讯云 COS + 数据万象（规划中，当前用 Unsplash 演示数据） |
| 依赖总数 | **3 个**（next / react / react-dom） |

## 许可

[MIT](./LICENSE) © 2026 塞上空许
