# 交接说明

> 给新开的 session 读。读完这一份就能接着干。
> 细节看 [README](../README.md)、[PRD](./PRD.md)、[MVP-PLAN](./MVP-PLAN.md)。

## 一句话

摄影师「塞上空许」的作品集 + 私人相册。Next.js 单进程：站点 + `/api/*` 都在 `next start` 跑，腾讯云 COS 存图，SQLite 存用户。

## 名字

`/admin/` 这个控制台叫「**工作室**」（logo 单字「室」）。以前叫「相册」——
名不副实：壳里装着首页文案、站点 meta、用户账号，不只是照片。

侧边栏分三组：

| 组 | 项 |
| --- | --- |
| 内容 | 仪表盘 / 照片管理 / 相册分类 |
| 站点 | 站点内容 |
| 管理 | 用户与权限 |

「系统设置」这个 tab 也改成了「**站点内容**」—— 它管的是公开站点的内容
（首页九幕文案 + 封面 + 站点 meta），不是配置开关。

公开站的 `/album/` 仍然叫「相册」—— 那个确实就是相册。

## 跑起来

```bash
cp .env.example .env       # 填 COS_* 与 SESSION_SECRET
npm run dev                # → 3000（脚本里已固定 --webpack，见下）
```

`http://localhost:3000/album/` 浏览，`/admin/` 进「工作室」（控制台）。
账号 `photog`，密码是测试用的（**部署前必须改**）。

生产模式：`npm run build && npm start`（`next start`，不能 `next export`）。

## 已验证 / 未验证

**别把「构建通过」当成「能用」。** 下面这些是实际跑通的：

| | 状态 |
| --- | --- |
| COS 桶配置（ACL / 策略 / CORS / 数据万象） | ✅ 逐项实测 |
| SQLite 用户系统（重名/停用/删自己/角色/last_admin 等边界） | ✅ |
| 登录 / 注册 / 改密 / 重置密码 / 踢人 / 失败审计 | ✅ smoke 16/16 |
| 19 个 `/api/*` 端点（`next start` 模式下） | ✅ |
| `/register/` 页面渲染 + 真实提交 | ✅ 浏览器实测 |
| `/admin/` 后台（登录、上传、行内编辑、改密、生成重置链接、踢人） | ✅ 浏览器实测 |
| `/account/` 自助改密 + 改密后旧 session 失效 | ✅ 浏览器实测 |
| `/reset-password/` 一次性 token 走通 | ✅ 浏览器实测 |
| Nav 登录态感知 + 退出 | ✅ 浏览器实测 |
| `/album` 构建期烘真实照片、网格排布、灯箱 | ✅ |
| `/album` 的**浏览器内交互** | ⚠️ 只验过 DOM 尺寸和截图，没验过鼠标拖拽 |
| 站点内容：12 个内容块的版本列表 / 从旧版改并发布 / 恢复旧版 | ✅ 浏览器实测 + Playwright |
| 站点内容：图片从公开相册挑选（存 photoId，渲染时现签） | ✅ 浏览器实测（真实 COS 桶） |

## 站点内容现在能做什么

「站点内容」（旧称「系统设置」）不再是 12 个折叠表单，而是**每块一个版本列表**：

- **左栏** 12 个内容块（首屏 / 关于 / 订阅 / 页脚 / 主推故事 / 顶导航 /
  三段手记 / 人像志介绍 / 站点 meta / 作品系列），每行带当前版本时间与版本数。
- **右栏** 该块的版本历史 +「编辑内容」按钮（**编辑器是弹框**，不内联 ——
  12 个块的表单都很长，内联会把版本历史顶出屏幕）。旧版本**永不覆盖** ——
  恢复历史版本本身就是再发一版，历史只增不减。
- 弹框里没保存就关会走二次确认（编辑器的草稿在它自己内部，父级看不见改没改）。
- 每块支持从任意一版「编辑」（以它为基础改完再发）或「恢复」。
- 图片字段（hero / story / 关于肖像 / 作品系列）可以直接从**公开相册**里挑。
  存的是 photoId 不是 URL —— 签名 URL 900 秒就过期，存 URL 等于存定时炸弹
  （见 docs/REFACTOR/04-decisions.md 的 ADR-0007）。

设计取舍与迁移细节见 docs/REFACTOR/02-admin.md 末节与 ADR-0006 / ADR-0007。

## 需要人来做的事

- [ ] **改掉测试口令** —— photog 的密码在对话记录里明文出现过
- [ ] 删掉 `assistant` 账号（测试角色模型时的副产品）
- [ ] 部署前把 `.env` 里的 COS 密钥**轮换一次**
- [ ] **部署必须是 `next start`，不是 `next export`** —— SQLite 用户库要常驻 Node
- [ ] 部署环境**数据库必须在持久化磁盘上**。SCF / CloudBase 这类无状态运行时会清空文件系统，SQLite 用户库会丢

## 会立刻咬人的四件事

**1. `--webpack` 不能省 —— 已经写进 `npm run dev` 脚本了。** 本机 Turbopack 必失败：
`Can't resolve '@vercel/turbopack-next/internal/font/google/font'` ——
`app/layout.tsx` 用了 `next/font/google`，而 Turbopack 的 font 加载器在
`@vercel/turbopack-next` 里：**这个包 node_modules 里没有、lockfile 里没有、
`next@16.3.7` 的 package.json 里也没声明**（实测 2026-10-22）。
所以 `npm run dev` 已固定成 `next dev --webpack`；想试 Turbopack 用 `npm run dev:turbo`
（会 500，别用）。是环境问题，与代码无关。

⚠️ 同一目录下**只能有一个 dev server**：第二个 `npm run dev` 会报
`⨯ Another next dev server is already running.`（Next 16 的 dev 锁），
看到这条先停掉旧的那个（`lsof -ti:3000 -sTCP:LISTEN | xargs kill -9`）。

**2. `npm run typecheck` 会失败，是既有问题。** `LayoutProps<"/">` 报约束错误，
源于 `.next/dev/types` 与 `.next/types` 两份全局路由类型冲突
（前者 `LayoutRoutes = never`）。已在 `git stash` 后的干净代码上复现过，与本项目开发无关。
绕过：先 `next build` 再 typecheck，或 `rm -rf .next/dev tsconfig.tsbuildinfo`。
**构建本身通过，部署不受影响。**

**3. 页面端口必须逐字出现在签名服务的 `ALLOWED_ORIGIN` 里。** 否则浏览器只显示
一句 `Failed to fetch`，看不出是跨源被拒。改端口就要同步改。

**4. 网页注册默认是关的。** 要开必须给签名服务 `.env` 加 `REGISTRATION_OPEN=true`，
留空则 `/api/register` 返回 403、`/register/` 页面自动降级成「暂未开放」。
**没有邀请码** —— 任何人都能自助注册，但拿到的**一律是 viewer**：
能登录浏览，不能上传、改相册清单、删图、管用户。管理员只能 CLI 建：
`npm run user -- add <用户名> [显示名] --admin`。

⚠️ **注册不保护照片。** `GET /api/album` 匿名可读、`/album/` 页面无登录门槛，
照片本来就是公开的。注册只决定「谁能建账号」，授权在 COS 桶策略那一层。
想真正限制谁能看照片，得改桶策略。

## 🔴 还没做：COS 桶必须改私有读

代码侧已经全改成签名 URL 了，但**桶的 ACL 还是公共读**，
所以现在 `isPublic=false` 的照片，拿到 key 拼裸 URL 照样能打开（实测 HTTP 200）。
**签名形同虚设，私有等于没私有。**

要去控制台改（我没有桶的凭据，这步只能你做）：

1. 控制台 → 对象存储 → 存储桶 `photo-1453349696` → **权限管理**
2. 存储桶访问权限：公共读 → **私有读写**
3. 确认 **CORS** 与 **数据万象** 仍然启用（签名直传与缩略图都依赖它们）

改完实测：私有图的裸 URL 应返回 403，签名 URL 仍 200。

```bash
curl -o /dev/null -w "%{http_code}\n" \
  "https://photo-1453349696.cos.ap-beijing.myqcloud.com/<某张私有图的 key>"
# 期望：403
```

注意：`npm run build` 在构建期取清单，**没有会话**，所以烘进静态 HTML 的
只能是公开照片。私有照片一律在客户端登录后再取签名 URL（现在就是这么做的）。

## 权限模型（改动时务必先读）

照片与相册**按 owner 隔离，与 role 无关** —— 管理员也只拥有自己的照片。

| 概念 | 说明 |
| --- | --- |
| `ownerId` | 照片归属者的 userId，权限判定的唯一依据 |
| `isPublic` | true=所有人可见；false=只有 owner 可见（走签名 URL） |
| `role` | **只管账号管理**（增删用户、改角色），不涉及照片 |

- **写端点看 owner**：`POST /api/sign`、`PATCH/DELETE /api/photo/*`、
  `PUT /api/album`。改这些时挂 `requirePhotoOwner`。
- **`PUT /api/album` 只采纳请求者自己的条目**，别人的按服务端现值保留 ——
  整份覆盖会让两人同时编辑时互相抹掉。
- **对象键带 owner 段**：`image/<userId>/<年>/<月>/<id>-<名>`。
  ownerOfKey() 靠这个判定归属，别删。
- 存量照片迁移时被归到 `legacy_photographer`，`isPublic: true`。
  **要用后台管理这批照片，得先把 ownerId 改成你的真实 userId**，
  否则你看不到也改不了它们（这是有意的：宁可找不到，也不给错人）。

## ⚠️ 别再犯：清单合并会静默损坏数据

`PUT /api/album` 曾经为了「保证归属正确」做了两件危险的事，**都出过事故**：

1. **相册归属判定太严** → 存量相册（归 `legacy_photographer`）被判成
   「别人的」，在合并时被丢弃。相册整个消失，照片的 `albumId` 变成悬空引用。
2. **悬空引用被悄悄改写** → 原来的兜底是
   `albumIds.has(p.albumId) ? p : {...p, albumId: 其他相册或空串}`，
   结果照片看起来正常、实际已挂错地方。**这是最坏的一类 bug：静默损坏。**

现在的做法：

- 相册归属同时认 `ownerId` 和 `alb_<userId>_` 前缀，存量相册不会丢。
- 悬空引用**不再改写**，直接返回 400 `album_not_found` 并列出受影响照片 id。
  让它响，比让它错好。

**改这段逻辑前先想清楚**：任何「自动修正」引用完整性的代码，
都可能把数据损坏伪装成正常。

## 账号管理



角色只有两级，存在 `users.role` 列：

| 角色 | 能做什么 |
| --- | --- |
| `admin` | 上传、改清单、删图、管用户 |
| `viewer` | 只能登录浏览；所有写端点返回 403 |

- **写端点全部挂了 `requireAdmin`**：`PUT /api/album`、`POST /api/sign`、
  `DELETE /api/photo/:id`、`POST /api/photo/:id/restore`、
  `DELETE /api/photo/:id/purge`、`POST/PATCH/DELETE /api/users`。
  加新写端点时**务必带上**，漏一个等于把权限送出去。
- `GET /api/users` 只要求登录 —— 前端后台页要靠它判断当前角色。
- **防锁死**：降级、停用、删除最后一个 admin 一律 400 `last_admin`。
  想加别的角色变更路径时，同样要挡住这条。
- 加 `role` 列的迁移会把**存量账号全回填为 admin**（加列前没有角色概念），
  别改成 viewer，否则会把现有人踢出管理权限。

## 两条实现上的教训

写这块时各踩一次，都是静默失败：

**缩略图必须跟随原图比例。** 网格单元按 `height/width` 定高，
缩略图若强裁成方形，`object-fit` 会二次裁切，观众看到的是被放大的局部。

**灯箱图片用绝对定位（`position:absolute; inset:0`），不要用 `max-height:100%`。**
百分比高度在 grid 容器里解析不出来时静默失效，图按原始像素铺出去
（实测 844px 溢出 517px 的舞台）。判断修好没有，要比
`img.clientHeight` 与 `stage.clientHeight` 是否相等 —— 肉眼看不出
「留边 5px」和「裁掉 5px」的区别。

## 这台机器的进程残留

开发期间在 8787/8788/8790/8795/8802/8803/3000/3100 起了服务，
部分进程沙箱无权结束，会导致 `EADDRINUSE`。
清理（需在非沙箱终端执行）：

```bash
lsof -ti:3000,3100,3200,8787,8788,8790,8795,8802,8803 -sTCP:LISTEN | xargs kill -9 2>/dev/null
cd /Users/fmq/Documents/minimax/developing && rm -rf .next/dev
```