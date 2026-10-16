# 决策记录（ADR · PR 决策与权衡）

## ADR-0001：首页 server-only 守门

**状态**：PR-2 采纳

**背景**

首页 `app/page.tsx` 既要拉 COS 签名拿封面，又要把签名 SDK 拽进服务端组件再串到静态 HTML 里。如果未来误从 client component import，会把 `node:sqlite`、`cos-nodejs-sdk-v5` 拖进 client bundle —— 一次失败就污染整张首页。

**决策**

- 在 `lib/series-covers/index.ts` 顶部加 `import "server-only"`（Next.js 官方机制）。
- 同时把 `enrichSeriesWithCovers` 函数整体从 `app/page.tsx` 抽出来，未来唯一允许 import signer 的入口。
- 依赖通过参数注入（`readManifest` / `presignGet` / `getFirstAdminId`），便于 stub 单测。

**实测**

PR-2 实施时，在 `components/Nav.tsx` 临时加 `import "server-only"`，跑 `next build --webpack`，webpack 报：

```
x You're importing a module that depends on "server-only".
  This API is only available in Server Components
```

证实守门有效。探针代码已撤回。

## ADR-0002：后台状态用 hooks，不用 Zustand / Redux

**状态**：PR-5 采纳

**背景**

AdminApp 重构前是 1348 行 `useState` 全集中于一处的怪物。一上来想用 Zustand 把 17 个 state 提到全局 store。

**决策**

- 选 plain hooks + props drilling。
- 5 个 hook 各自封装一个**状态机**（session / manifest / upload / cover / users），互不耦合。
- props 透传给子组件；React Context 也不上（drilling 深度 2-3 层，可接受）。

**理由**

1. **测试性**：hooks 是纯函数 + 状态机，单测不需 Provider 包裹。Zustand store 要 mock store-to-component 的 hook 调用，多一层抽象。
2. **拆/合成本**：重构各 PR 边界清晰（一个 hook = 一个 PR 步骤），修改各 hook 不影响其他。
3. **学习曲线低**：项目里全 `useState`、无任何 state lib；引入 Zustand 要新约定。

**回滚条件**

若未来 AdminApp 出现跨 5+ 组件共享的大状态（如批量选择 + 实时搜索 + 拖拽排序联动），可单独立一个 Zustand store。

## ADR-0003：lib/data 拆域但保留 barrel re-export

**状态**：PR-3 采纳

**背景**

老 `lib/data.ts` 单文件 290 行。拆域（site/nav/home/...）后，老组件代码 `import { hero } from "@/lib/data"` 要改 8+ 个文件，diff 大风险高。

**决策**

- 拆为 `lib/data/{site,nav,home,story,about,subscribe,footer}.ts` + `lib/data/index.ts` barrel。
- 所有老 import 路径继续解析到 barrel，零行组件代码改动。
- barrel 注释明确写"新代码请精确 import 各域文件"，引导后续迁移。

**回滚条件**

6 个月（PR-1 写的窗口期）后，CI 加一条 lint：禁止 `from "@/lib/data"`（允许 `from "@/lib/data/home"` 等精确路径）。届时可以安全清空 barrel。

## ADR-0004：lib/admin-api 与 lib/album-client 并存

**状态**：PR-4 采纳

**背景**

访客侧的 `lib/album-client.ts` 早就有（取 manifest、签名 URL 等）。后台 SDK 应该与它分开还是合并？

**决策**

- 新建 `lib/admin-api/`，专门服务后台 UI（错误翻译、乐观锁、上传签名）。
- `lib/album-client.ts` 保留不动，因为访客侧 `AlbumBrowser` / `Lightbox` 等组件已经在用，迁出去 diff 风险太高。

**理由**

- 后台错误处理（401/429/503）专为后台体验优化，与访客侧"读不到就显示空态"的策略不同。
- 上传签名 URL、optimistic update 这些都不在访客侧的 scope。

**回滚条件**

若访客侧某个用例需要 admin-api 的错误翻译（如"你无权看这张图"），应迁到访客 SDK 而不是反过来；保持 `admin-api` 名字作为"私有后台"语义。

## ADR-0005：6 处遗留裸 `/api/*` 调用 vs PR-4 一次性全迁

**状态**：PR-6 采纳 / TODO 入档

**背景**

PR-4 限制在后台范围。当时跑 lint-api-paths 找出 6 处访客侧裸 `fetch('/api/...')`：
- `components/Nav.tsx`（session/logout）
- `app/account/AccountForm.tsx`（session/logout）
- `app/register/RegisterForm.tsx`（register/register-status）

**决策**

- PR-6 加白名单 `ALLOWLIST`，让 lint 通过。
- 在 `00-overview.md` 明确标记为遗留。

**未采纳的方案**

- **一次性全迁**：会扩到 `lib/public-api/` 与 `lib/account-api/`，重构范围膨胀。后续如要做，可单独立 PR。

**回滚条件**

未来要消除这些重复时，需要：
1. 新建 `lib/account-api/`（session / logout / register / register-status），与 admin-api 风格一致
2. 新建 `lib/public-api/`，处理公开访客侧读 manifest / 签名 URL（如果还要新加 IO）
3. 三个白名单文件改 import 后，从 lint ALLOWLIST 删除
