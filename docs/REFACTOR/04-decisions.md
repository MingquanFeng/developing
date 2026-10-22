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

## ADR-0006：首页内容走追加写的版本流

**状态**：采纳

**背景**

`site_content` 表每个 section key 只存**一份**当前值。admin 改错一次，旧内容就找不回来了 ——
"改回以前那版" 只能靠人手把原文重新敲一遍。随着内容块从 4 个涨到 12 个，
这个缺口越来越难受。

**决策**

- 新表 `site_content_versions`：**追加写**，每次发布/重置都插一条完整快照，旧版本永不删。
- `site_content` 保留，语义收窄为「当前生效的那一份」—— 页面仍然读它，读取路径零改动。
- 发布 = 一个事务里三件事：旧版本卸任（`is_current` 1→0）→ 插新版本 → upsert `site_content`。
  必须同生共死：留下「两个 current」或「current 版本的内容与 `site_content` 不一致」，
  历史就在撒谎（说生效的是 A，页面显示的是 B）。
- 「重置为默认」= 删掉 `site_content` 的覆盖行 + 追加一条默认内容的版本。
  **不**把默认值写回 `site_content`：有行就意味着"这份内容来自 DB"，
  会盖住静态默认值的后续改动。
- 恢复历史版本 = 用那一版的 content 原样再发一版（`based_on_id` 指回它自己）。
  历史永远不被覆盖 —— 恢复动作本身也是一条新版本。
- 迁移回填：老部署的 `site_content` 行补一条基线版本（幂等），否则升级后
  历史页第一次打开是空的，看起来像"从没改过"。

**返回窗口**

`listSiteContentVersions` 每块最多返回最近 200 条。版本的 content 是完整快照
（每条 1~3 KB），全量返回是"发布次数 × 块数 × 快照大小"—— 攒够几百条就是几十 MB 的 JSON，
后台一打开就卡死。历史本身永远在 DB 里，截断只发生在返回层。

**未采纳的方案**

- **原地覆盖 + 手动备份**：没有版本链，改错就是改错。
- **Git 式版本（父子树）**：只有线性一条链，够用；真要分支再上。

**回滚条件**

若将来历史量级需要分页，把 `MAX_VERSIONS_PER_KEY` 换成游标分页即可，
表结构不用动。

## ADR-0007：内容里的图片存 photoId，不存 URL

**状态**：采纳

**背景**

hero / story / about / series 的图片字段原本是手填的 URL 文本框，填的是 Unsplash 外链。
管理员想用站点自己的照片（腾讯云 COS），唯一的办法是把 COS 的签名 URL 贴进去 ——
而签名 URL **900 秒就过期**（`lib/signer/config.ts` 的 `readExpires`）。
存进 DB 等于存了个定时炸弹：过一刻首页的图就全裂。

**决策**

- 新增可选字段 `photoId: string | null`（hero / story / about / series 各一项）。
  null = 用原来的兜底 URL。
- 存的是 photoId，**渲染时现签**：`lib/site-images.ts` 在服务端按 photoId
  查 manifest（必须是 `isPublic` 且不在回收站）→ `presignGet` 签出临时 URL。
- 解析失败（找不到 / 签不了）→ **静默保留原值**，绝不抛错、绝不让首页白屏
  （与 `lib/series-covers` 的容错原则一致）。
- 优先级：`photoId` > 相册封面（series）> 兜底 URL。

**取舍**

- 图片字段多了一个语义（`image` 是兜底、`photoId` 是显式选择）。换来的是
  存进 DB 的东西永远有效，不需要任何"到期重签"的维护。
- alt 文本的填充规则刻意不对称：hero/story/about 是"已填的不动、空的才补"，
  series 是"照片标题优先"—— series 的 image/imageAlt 归相册封面 enrichment 管，
  不这样定的话 alt 描述的是封面那张图、页面上显示的却是 admin 选的那张。

**回滚条件**

若将来要支持"从站外 URL 选图"，给 photoId 之外再加一个显式的 `imageUrl` 字段，
不要复用 `image` —— 复用会让"这是兜底还是显式"重新变得不可判别。
