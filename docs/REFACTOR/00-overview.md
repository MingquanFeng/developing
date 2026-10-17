# 重构总览（2026 Q4 · 首页 + 后台）

**状态：全部完成 ✅**

| # | 范围 | commit | 状态 |
|---|---|---|---|
| PR-1 | `lib/contracts.ts` 单点：前后端共享类型 | `4332431` | ✅ |
| PR-2 | 首页 `lib/series-covers` `server-only` 守门 | `ff69500` | ✅ |
| PR-3 | `lib/data` 域化 + `components/home/*Section` 拆组件 | `b0d5ceb` | ✅ |
| PR-4 | `lib/admin-api` 客户端 SDK + AdminApp 调用点替换 | `d841835` | ✅ |
| PR-5 | AdminApp 拆协调器 + 子组件 + 5 个 hooks | `fe2ef99` | ✅ |
| PR-6 | 工程化收尾（lint、scripts、文档） | (PR-6) | ✅ |

## 目标

1. 首页 (`/`) 与 后台 (`/admin`) 的代码边界变清晰：首页构建期纯静态、后台运行时单页应用。
2. 公共类型契约单点化，前后端共享。
3. 后台总控组件（重构前 `AdminApp.tsx`，1348 行）拆为协调器 + 子组件 + 客户端 SDK。
4. 每一步可独立合入：CI 绿 + 端到端不回归。

## 架构快照（PR-5 末）

```
构建期 (SSG, output=export)
└─ app/page.tsx                           ← server component
   ├─ components/home/*Section.tsx        ← 9 个独立 server component
   └─ lib/series-covers                   ← import "server-only" 唯一入口
      └─ lib/signer/{album,cos,users,config}  (Node-only)

运行时 (Admin SPA)
└─ app/admin/page.tsx
   └─ components/admin/AdminApp.tsx (234 行协调器)
      ├─ hooks/
      │   ├─ useAdminSession              探测/登录/登出
      │   ├─ useManifest                  data + reload + save(乐观锁)
      │   ├─ useUploadQueue               拖拽 → COS 直传 → 入库
      │   ├─ useCoverModal                封面弹层状态机
      │   └─ useUsersPanel                用户管理状态机
      ├─ AdminShell                       顶栏 + tabs + 当前 tab 内容
      │   ├─ DropZone / PhotoRow / Frame / Block
      │   ├─ tabs/UsersTab
      │   └─ 内联 CoversPanel
      ├─ LoginForm                        未登录态
      ├─ modals/CoverModal / ResetLinkModal
      └─ lib/admin-api/                   客户端 SDK（fetch wrap + 业务模块 + 错误翻译）
         ├─ client / errors / auth / manifest / photos / users / upload
         └─ /api/*  (App Router Route Handlers, Node runtime)
            └─ lib/signer/*  (业务逻辑 + SQLite + COS)
```

## 已建立的回归基线

- `npx tsc --noEmit` — 0 errors。
- `npx next build --webpack` — 0 errors，产出 `out/` 共 25 条路由。
- `npm run lint:api-paths` — 0 violations。
- 静态产物拷贝到 `__snapshots__/baseline-out/`（已 .gitignore），每 PR 末做一次 hash 校验。

## 工程化产物（PR-6）

| 资产 | 路径 | 用途 |
|---|---|---|
| API 路径 lint | `scripts/lint-api-paths.mjs` | 防裸 `fetch('/api/...')` 回退到业务组件 |
| server-only 守门自检 | `scripts/check-server-only.mjs` | 在 Nav 临时插探针跑 build 验守门 |
| 类型契约总表 | `lib/contracts.ts` | PR-1 |
| 首页架构说明 | `docs/REFACTOR/01-home.md` | PR-2 + PR-3 |
| 后台架构说明 | `docs/REFACTOR/02-admin.md` | PR-4 + PR-5 |
| 类型契约迁移日志 | `docs/REFACTOR/03-contracts.md` | PR-1 |
| 决策记录 | `docs/REFACTOR/04-decisions.md` | 5 个 ADR |

## 遗留（与本重构无关）

- SQLite 构建期 9 worker 并发访问偶发 `database is locked`，与本重构无关。
- `next dev` Turbopack 字体解析失败，必须 `--webpack`；README 已说明。
- 访客侧 `components/Nav.tsx` / `app/account/AccountForm.tsx` / `app/register/RegisterForm.tsx`
  仍有 6 处裸 `/api/*` 调用；TODO 列入 `lib/public-api/` / `lib/account-api/` 拆分。详见
  `scripts/lint-api-paths.mjs` 的 ALLOWLIST。
