# 交接说明

> 给新开的 session 读。读完这一份就能接着干。
> 细节看 [README](./README.md)、[PRD](./docs/PRD.md)、[MVP-PLAN](./docs/MVP-PLAN.md)。

## 一句话

摄影师「塞上空许」的作品集 + 私人相册。静态站点 + 腾讯云 COS + 一个独立签名服务。

## 跑起来

```bash
# 终端 1
cd services/signer && node dist/index.js     # → 8787

# 终端 2
npx next dev --webpack                       # → 3000，--webpack 必须带
```

`http://localhost:3000/album/` 浏览，`/admin/` 上传后台。
账号 `photog`，密码是测试用的 `testpw123456`。

## 已验证 / 未验证

**别把「构建通过」当成「能用」。** 下面这些是实际跑通的：

| | 状态 |
| --- | --- |
| COS 桶配置（ACL / 策略 / CORS / 数据万象） | ✅ 逐项实测 |
| 签名服务 8 个接口全链路 | ✅ 16 项 E2E |
| SQLite 用户系统（重名/停用/删自己等边界） | ✅ |
| `/album` 构建期烘真实照片、网格排布、灯箱 | ✅ |
| `/album` 的**浏览器内交互** | ⚠️ 只验过 DOM 尺寸和截图，没验过鼠标拖拽 |
| **`/admin` 的浏览器内交互** | ❌ **完全没验过** —— 拖拽上传、进度条、行内编辑、回收站 |

后两项是当前最大的未知。第一次接手建议先把 `/admin` 跑一遍。

## 需要人来做的事

- [ ] **改掉测试口令** —— `photog` / `testpw123456` 是开发时随手设的，
      且在对话记录里明文出现过。`npm run user -- passwd photog`
- [ ] 删掉 `assistant` 账号（测试角色模型时的副产品）
- [ ] 部署前把 `.env` 里的 COS 密钥**轮换一次**
- [ ] 签名服务部署到服务器 —— **数据库必须在持久化磁盘上**。
      SCF / CloudBase 这类无状态运行时会清空文件系统，SQLite 用户库会丢。

## 会立刻咬人的三件事

**1. `--webpack` 不能省。** 本机 Turbopack 构建会失败：
`Can't resolve '@vercel/turbopack-next/internal/font/google/font'` ——
那个包 node_modules 里不存在，lockfile 里也没有。是环境问题，与代码无关。

**2. `npm run typecheck` 会失败，是既有问题。** `LayoutProps<"/">` 报约束错误，
源于 `.next/dev/types` 与 `.next/types` 两份全局路由类型冲突
（前者 `LayoutRoutes = never`）。已在 `git stash` 后的干净代码上复现过，与本项目开发无关。
绕过：先 `next build` 再 typecheck，或 `rm -rf .next/dev tsconfig.tsbuildinfo`。
**构建本身通过，部署不受影响。**

**3. 页面端口必须逐字出现在签名服务的 `ALLOWED_ORIGIN` 里。** 否则浏览器只显示
一句 `Failed to fetch`，看不出是跨源被拒。改端口就要同步改。

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