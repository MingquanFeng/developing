# 后台架构说明（PR-4 + PR-5 后）

## 名字与分组

这个控制台叫「**工作室**」（logo 单字「室」，浏览器标题「工作室 — 塞上空许」）。
以前叫「相册」—— 名不副实：壳里装着首页文案、站点 meta、用户账号，不只是照片。

侧边栏因此分三组：

| 组 | 项 |
| --- | --- |
| 内容 | 仪表盘 / 照片管理 / 相册分类 |
| 站点 | 站点内容 |
| 管理 | 用户与权限 |

两组只给 admin 看（viewer 只有「内容」组）。分组在窄屏（≤700px）用
`display: contents` 摊平成横排 —— 否则组会竖着堆。

「系统设置」这个 tab 改名「**站点内容**」：它管的是公开站点的内容
（首页九幕文案 + 封面 + 站点 meta），不是配置开关。tab 的 key 仍是
`system`（内部标识，改它要动 `AdminTab` 联合类型 + AdminApp 的分支，
没必要）。

## 目标

`/admin` 是运行时 SPA：用户在浏览器操作，所有 IO 走 `/api/*` 与服务端交互。前后端类型契约由 `lib/contracts.ts` 单点定义；后台客户端 SDK 集中所有 fetch + 错误处理；AdminApp 拆为协调器 + 5 个 hooks + 7 个子组件。

## 三层结构

### 第一层 — `lib/admin-api/` 客户端 SDK（PR-4）

```
lib/admin-api/
├── client.ts        apiFetch(path, init)  共享 fetch wrapper
│                    readJson(res)         JSON 解析助手
├── errors.ts        describeApiError(status, body, fallback?)
│                    asApiError(res, fallback?) → throw
│                    isNetworkError(msg)
│                    NETWORK_DOWN_HINT
├── auth.ts          fetchSession / loginSession / logoutSession
├── manifest.ts      fetchManifest / updateManifest（3 次乐观锁重试）
├── photos.ts        patchPhoto / trashPhoto / restorePhoto / purgePhoto
├── users.ts         fetchUsers / createUser / updateUser / deleteUser /
│                    generateResetLink / revokeUserSessions
├── upload.ts        presignUpload(files)  SDK_BATCH_LIMIT = 50
└── index.ts         barrel
```

设计原则：

- **client.ts 不翻译业务错误**——只 wrap fetch（credentials、JSON 头、JSON 解析）。
- **errors.ts 负责 401/429/503 翻译**——纯函数 `describeApiError(status, body, fallback?)`，便于单测。
- **业务模块只关心 happy path**——失败都抛 `Error`（`message` 已含人类可读中文），调用方只 catch 后 `setNotice`。
- **每个端点一个明确语义函数**——`trashPhoto`、`restorePhoto`、`purgePhoto` 不混；批量由调用方循环。
- **`updateManifest` 自带乐观锁**——3 次 409 自动拉最新 + bump revision 再覆盖，调用方一行解决。

### 第二层 — `components/admin/hooks/` 5 个 hooks（PR-5 上半）

```
hooks/
├── useAdminSession.ts   status: loading/anonymous/authed
│                        busy, error, username, password (login 表单态)
│                        login(), logout(), setUsername(), setPassword()
├── useManifest.ts       data + reload + save(updater)
│                        buildNewPhotos + defaultAlbum(辅助)
├── useUploadQueue.ts    queue + addFiles + retry + clearDone
├── useCoverModal.ts     coverAlbum / coverBusy / coverMsg
│                        openCover / closeCover / saveCover
└── useUsersPanel.ts     users + 所有用户操作状态机
                         addUser / resetPassword / setDisplayName /
                         toggleDisabled / removeUser / generateLink /
                         kickUser / copyLink / closeLink
```

每个 hook 都是独立状态机，**不依赖 React Context**——上层需要时直接传 props。这让它们易于单测（PR-6 规划中）。

### 第三层 — `components/admin/` 子组件（PR-5 下半）

```
AdminApp.tsx          (234 行协调器)
├─ AdminSessionGate   （实际上 AdminApp 内联了 status 三态分发；未来
│                    若想抽也行，目前权衡协调器内部更清晰）
├─ LoginForm          username/password/busy 受控 + 错误展示
├─ AdminShell         顶栏 + notice + DropZone + queue + tabs + 当前 tab
│   ├─ 内联 CoversPanel     封面 tab 内容（30 行不值得独立文件）
│   ├─ tabs/UsersTab        用户与权限（调 useUsersPanel hook）
│   ├─ DropZone             拖拽上传
│   └─ PhotoRow             行内编辑（标题/地点/相册/公开私有）
├─ modals/CoverModal        选 album 封面
└─ modals/ResetLinkModal    一次性重置链接
```

## AdminApp 协调器结构

```
AdminApp ───┐
  useAdminSession ──→ { me, status, login(), logout() }
  useManifest    ──→ { data, reload, save }
  useUploadQueue ──→ { queue, addFiles, retry }
  useCoverModal  ──→ { coverAlbum, saveCover, ... }
  local state    ──→ { tab, selected, shellNotice }

三态分发：
  status === 'loading'  → <Frame><Block>...</Block></Frame>
  status === 'anonymous' → <LoginForm onSubmit={login} />
  status === 'authed'    → <AdminShell ...actions /> + CoverModal
```

`status === "authed"` 这一段是 AdminApp 最厚的部分（~120 行）——它在 hooks 之上组装 6 个动作（`onEditPhoto`、`onTrashOne/Many`、`onRestore`、`onPurge`、`onCoverPick/Clear`、`onLogout`），把它们以 callback 形式透传给 `AdminShell`。子组件们不再持有业务状态。

## 一些设计取舍

### 1. 为什么不用 React Context

hooks 的返回值是 plain object，传 props 给子组件。Context 收益是避免 prop drilling —— 我们有 6 个 callback，深度 2-3 层，drilling 成本低。但 Context 会让 hooks 难以单测（需要 Provider 包裹），权衡选 props。

### 2. 为什么 `defaultAlbum` / `buildNewPhotos` 放在 `useManifest.ts`

它们本质是"构造 Manifest 的助手函数"，属于 manifest 域。`useUploadQueue` 也用 `buildNewPhotos`，所以**导出而不是藏在 AdminApp 里**——单测时也好指代。

### 3. 为什么 `CoverModal` 与 `ResetLinkModal` 拆出来

- 两者都是 fixed-position 弹层，独立于列表渲染，state 由各自 hook 持有；
- 拆出后 AdminApp 不再有"弹层内部 JSX"——文件不污染到 UI 细节；
- 单测 / Storybook 都能独立 mount。

### 4. `useCoverModal` 不合并进 `useManifest`

封面弹层的状态机（打开哪个 album、繁忙、提示）是 UI 状态，不属于 manifest 数据层。强行合并会让 `useManifest` 关心 UI 上的 coverAlbum 是哪个。分开更清晰。

## 文件边界表

| 文件 | 角色 | 行数（PR-5 末） |
|---|---|---|
| `AdminApp.tsx` | 协调器 | 234 |
| `AdminShell.tsx` | 已登录后外壳（含内联 CoversPanel） | 261 |
| `LoginForm.tsx` | 未登录表单 | 108 |
| `PhotoRow.tsx` | 单行编辑 | 125 |
| `DropZone.tsx` | 拖拽区 | 63 |
| `Frame.tsx` | 极简外壳 + Block | 30 |
| `tabs/UsersTab.tsx` | 用户与权限（含内联 UserRow） | 207 |
| `modals/CoverModal.tsx` | 选封面弹层 | 133 |
| `modals/ResetLinkModal.tsx` | 重置链接弹层 | 71 |
| `hooks/useAdminSession.ts` | 会话状态机 | 128 |
| `hooks/useManifest.ts` | manifest + 构造助手 | 121 |
| `hooks/useUploadQueue.ts` | 上传队列 | 125 |
| `hooks/useCoverModal.ts` | 封面状态机 | 81 |
| `hooks/useUsersPanel.ts` | 用户管理状态机 | 277 |

协调器 234 行是最长单文件 — 但这是 hooks + actions + 三态分发最长也最杂的部分，再抽下去反而拆碎。

## 如何未来加新 tab

1. `components/admin/tabs/NewTab.tsx`，props 接 me / data + 各自回调；
2. 必要时新 hook（如有复杂状态）；
3. `AdminShell.tsx` 的 tab + render 分支加一项；
4. `AdminTab` 类型联扩展（联合成员）。

## 站点内容：从「表单」到「版本管理」（2026-10）

站点内容 tab 现在有两块：**封面管理**（CoversPanel，选 series 相册封面）
+ **内容版本管理**（HomeContentPanel）。

### 内容版本管理的主从布局

```
components/admin/system/
├── HomeContentPanel.tsx   主从布局的组合器（左栏选块 / 右栏详情）
├── version-list.module.css 两栏栅格 + 版本行样式（<1280px 堆叠）
├── useSiteContent.ts       内容 + meta + 版本流 的 hook
├── ImagePicker.tsx        公开相册选图弹层（自己拉 manifest）
├── ContentEditorModal.tsx 内容编辑器弹层（点按钮才开，不内联）
├── PhotoThumb.tsx         懒加载缩略图（IntersectionObserver）
├── editors/
│   ├── PhotoField.tsx     「预览 + 选择 + 清除」小块（4 个 editor 共用）
│   └── …原有 12 个 editor，props 契约未变
└── lib/site-content-summary.ts  版本摘要（纯函数，可单测）
```

左栏 12 个内容块（块名 / 说明 / 当前版本时间 / 版本条数），
右栏是选中块的**版本历史列表**（编辑器不在右栏，见下）。

左栏的**顺序 = 首页自上而下的顺序**（顶栏 → 九幕 → 页脚），单一事实来源
是 `lib/site-sections.ts`（清单与顺序放在一起）。`lib/site-sections.test.ts`
读 `app/page.tsx` 的源码核对渲染顺序 —— 改了页面顺序忘了改清单，测试会红。

### 版本流的交互约定

| 动作 | 语义 | 服务端 |
| --- | --- | --- |
| 编辑器里保存 | 以当前正在编辑的那一版为基础，发布**新版本** | `PUT` 带 `basedOnId` |
| 版本行的「编辑」 | 把那一版的 content 灌进编辑器当草稿 | 只改本地 |
| 版本行的「恢复」 | 把那一版原样再发一版，成为当前生效版 | `PUT` 带 `basedOnId = 该版本 id` |
| 「重置为默认」 | 回到静态默认值 | `DELETE`，记一条「重置」版本 |

**旧版本永远不被覆盖** —— 恢复动作本身也是一条新版本，历史只增不减。

### 编辑器为什么是弹框

12 个块的表单都很长（hero 十几行，series 五组各 10 个字段）。内联在右栏会把
版本历史整个顶出屏幕 —— 想看历史得先滚过一个长表单。

所以：右栏只留版本历史 + 一个「编辑内容」按钮；点它（或版本行的「编辑」）
弹出 `ContentEditorModal`，表单自己滚，头部（标题 + 关闭）留在视口里。

- 弹层里还能再弹「从公开相册选择」的选图层 —— 两层都是 `position: fixed`，
  同 z-index 时后渲染的盖在上面，选图层在 DOM 里更靠后 ✓
- **关闭要走二次确认**：编辑器的草稿在它自己内部（`dirtyRef`），父级看不见
  用户改没改，只能保守地问「未保存的修改会丢失」。
  这一轮保存过的话（`savedRef`）直接关，不烦人
- 遮罩点击也走同一条确认路 —— 不是直接关

### 编辑器怎么换草稿

editor 内部用 `dirtyRef` 保护用户正在改的内容（`data` 变化时不同步覆盖）。
所以切换块 / 切换版本时**不能**指望 `data` prop 生效，得用 `key` 强制重挂载。

⚠️ 但 `key` 里**不能**拼 `draftVersionId`：保存成功后 `draftVersionId` 会指向
新发布的版本，一并换 key 会重挂载编辑器，把 editor 内部的「已保存」提示冲掉
（E2E 直接报 element not found）。所以另起一个 `editorEpoch` 计数 ——
只有「用户显式换草稿」（切块 / 点编辑 / 恢复 / 重置）才 +1。

### 公开相册选图

- 弹层自己调 `lib/admin-api/manifest.ts` 的 `fetchManifest()`，只列
  `isPublic && !trashedAt` 的照片，按相册分组。
- 缩略图走 `/api/photo/[id]/url?v=thumb`（签名 URL，900 秒有效）。
- 选中后存 **photoId**（不是 URL —— 签名 URL 会过期，见 ADR-0007），
  服务端渲染时由 `lib/site-images.ts` 现签。
- editor 的 props 契约不变：弹层状态由 editor 内部管，不往 AdminApp 冒泡。
