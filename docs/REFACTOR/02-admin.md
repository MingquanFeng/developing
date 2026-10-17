# 后台架构说明（PR-4 + PR-5 后）

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
│   ├─ tabs/UsersTab        用户管理（调 useUsersPanel hook）
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
| `tabs/UsersTab.tsx` | 用户管理（含内联 UserRow） | 207 |
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
