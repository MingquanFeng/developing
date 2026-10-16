# 重构总览（2026 Q4 · 首页 + 后台）

## 目标

1. 首页 (`/`) 与 后台 (`/admin`) 的代码边界变清晰：首页构建期纯静态、后台运行时单页应用。
2. 公共类型契约单点化，前后端共享。
3. 后台总控组件（现 `AdminApp.tsx`，1348 行）拆为协调器 + 子组件 + 客户端 SDK。
4. 每一步可独立合入：CI 绿 + 端到端不回归。

## 架构快照

```
构建期 (SSG, output=export)
└─ app/page.tsx                 ← 只 import server-only 边界的封面取数 + 9 个 section 组件
   └─ lib/series-covers         ← import "server-only"（唯一允许 import signer 的纯客户端调用）
      └─ lib/signer/{album,cos,users,config}  (Node-only,构建期使用)

运行时 (Admin SPA, 后台)
└─ app/admin/page.tsx
   └─ components/admin/AdminApp.tsx     (协调器)
      ├─ hooks/{useAdminSession,useManifest,...}
      ├─ components/admin/{tabs,modals}/*
      └─ lib/admin-api/{auth,photos,users,upload,errors}.ts
         └─ /api/*  (App Router Route Handlers, Node runtime)
            └─ lib/signer/*  (业务逻辑 + SQLite + COS)
```

## PR 计划

| # | 范围 | 估时 | 状态 |
|---|---|---|---|
| PR-1 | `lib/contracts.ts` 单点：前后端共享类型 | 0.5d | 进行中 |
| PR-2 | 首页 `lib/series-covers` `server-only` 守门 | 0.75d | 待 PR-1 |
| PR-3 | `lib/data` 域化 + `components/home/*Section` 拆组件 | 1.25d | 待 PR-2 |
| PR-4 | `lib/admin-api` 客户端 SDK + AdminApp 调用点替换 | 1d | 待 PR-3 |
| PR-5 | AdminApp 拆协调器 + 子组件 + 5 个 hooks | 1.5d | 待 PR-4 |
| PR-6 | 工程化收尾（lint、scripts、文档） | 0.5d | 待 PR-5 |

## 已建立的回归基线

- `pnpm typecheck` (`tsc --noEmit`) 0 errors。
- `npx next build --webpack` 0 errors，产出 `out/` 共 25 条路由。
- 静态产物拷贝到 `__snapshots__/baseline-out/`，每 PR 末做一次 hash 校验。

## 既有项目问题（已知，本次重构不修）

- SQLite 构建期 9 worker 并发访问偶发 `database is locked`，与本重构无关，记录在 ADR-0001。
- `next dev` Turbopack 字体解析失败，必须 `--webpack`；README 已说明。
