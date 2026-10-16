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

### 工程化检查

```bash
npm run typecheck           # tsc --noEmit 0 errors
npm run lint:api-paths      # 防裸 fetch(/api/...) 回退到业务组件
npm run check:server-only   # 在 Nav 临时插探针跑 build 验 server-only 守门
```

## 项目结构

```
构建期（SSG，output: export）
  app/
    page.tsx              主页 server component（编排 9 个 section）
    layout.tsx            字体注入、site metadata
    album/page.tsx        相册页
  components/home/        九幕 section 组件（HeroSection / JournalSection / ...
                          WorksSection / CoordsSection / StorySection /
                          Interlude03Section / AboutSection /
                          SubscribeSection / FooterSection）
  components/             原展示组件（Hero / Works / Coords / Story / ...）
  lib/series-covers/      ★ 唯一允许 import lib/signer/* 的服务端入口
  lib/signer/             Node-only：sqlite + cos + 用户表
  lib/data/{site,nav,
           home,story,
           about,subscribe,
           footer,index}   全站文案（按域拆，barrel 兼容老 import）

运行时（Admin SPA）
  app/admin/page.tsx      admin 路由
  components/admin/
    AdminApp.tsx          协调器（234 行）
    AdminShell.tsx        已登录后外壳 + tabs
    LoginForm.tsx         未登录表单
    Frame / DropZone / PhotoRow
    tabs/UsersTab         用户管理 tab
    hooks/                5 个状态机 hook
    modals/{CoverModal,
            ResetLinkModal}
  lib/admin-api/          后台客户端 SDK（auth / manifest / photos /
                          users / upload / errors / client）

共用
  lib/contracts.ts        ★ 前后端共享类型（Album / Photo / Manifest /
                          User / PublicUser / Role / SessionToken /
                          WriteResult / ResetLinkResponse / ApiError）
  lib/album-client.ts     访客侧 SDK（保留，listUsers 改用它）
  lib/album-types.ts      re-export contracts（含 formatBytes）

docs/
  PRD.md                  相册产品需求
  MVP-PLAN.md             实施方案
  REFACTOR/               2026 Q4 重构日志（00-overview / 01-home / 02-admin
                          / 03-contracts / 04-decisions）
scripts/
  smoke.mjs               烟雾测试
  user.js                 CLI 管理用户
  lint-api-paths.mjs      防裸 fetch(/api/...) 回退（PR-6）
  check-server-only.mjs   server-only 守门自检（PR-2 实测保留）
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
