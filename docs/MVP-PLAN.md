# MVP 实施方案 · 个人相册集

> 配套文档：[`PRD.md`](./PRD.md)
> 目标：5 个工作日内交付可用的上传 + 浏览闭环
> 仓库：`/Users/fmq/Documents/minimax/developing`

---

## 0. 一句话架构

```
                     ┌─────────────────────────────────────────┐
   浏览器             │  Next.js 静态站（现有，output: export）   │
   ────────           │  /            作品主页（不动）            │
     │                │  /album/      相册浏览（新增）            │
     │                │  /admin/      上传后台（新增）            │
     │                └─────────────────────────────────────────┘
     │                          │  ① POST /api/sign  拿预签名 URL
     │                          ▼
     │                ┌─────────────────────────────────────────┐
     │                │  签名服务（~200 行 Node，独立部署）        │
     │                │  持有 SecretId/SecretKey，只在服务端       │
     │                └─────────────────────────────────────────┘
     │                          │  ② PUT 直传（文件不经过服务端）
     │                          ▼
     │                ┌─────────────────────────────────────────┐
     └────── ③ GET/PUT /api/album ──→ 腾讯云 COS               │
                              │          image/    公开读（原图）│
                              │          _data/     私有读（元数据）│
                              │          _trash/    私有读（回收站）│
                              └─────────────────────────────────────┘
```

**关键点**：文件走 ② 浏览器直传 COS，签名服务和站点服务器都不经手图片字节。
`services/signer` 只是一个「发签名 + 读写 JSON」的小服务，约 200 行，无数据库。

---

## 1. 阶段 M0：云端环境准备（0.5 天 · 阻塞项）

这一阶段**不写代码**，但没做完后面全部跑不通。必须先做完。

### 1.1 建存储桶

控制台 → 对象存储 COS → 存储桶列表 → 创建存储桶

| 配置项 | 值 | 说明 |
| --- | --- | --- |
| 名称 | `saikongxu-album-125xxxxxxx` | 必须 `BucketName-APPID` |
| 所属地域 | 就近（上海用户选 `ap-shanghai`） | 决定了访问域名与内网流量费 |
| 访问权限 | **私有读写** | 稍后按前缀分别授权，不要整桶公开 |
| 版本控制 | 关闭 | MVP 不需要 |

### 1.2 让 image/ 公开读，桶本身保持私有

**桶的公共权限设为「私有读写」**（控制台 → 权限管理 → 存储桶访问权限）。

> ⚠️ **不要选「公有读私有写」。** 那是**整个桶**公开，`_data/album.json`
> 里的相册元数据（含未发布照片）也会暴露。控制台**没有前缀级 ACL**，
> 且腾讯官方明确不建议用文件级 `x-cos-acl`，应保持继承桶权限。

正确做法是**存储桶策略**（Bucket Policy），只对 `image/*` 开匿名读：

控制台 → 存储桶 → 权限管理 → **Policy 权限设置** → 策略语法 → 编辑，粘贴
（把 `<地域>` `<APPID>` `<桶名>` 替换成真实值）：

```json
{
  "version": "2.0",
  "statement": [
    {
      "effect": "allow",
      "principal": { "qcs": ["qcs::cam::anyone:anyone"] },
      "action": ["name/cos:GetObject"],
      "resource": ["qcs::cos:<地域>:uid/<APPID>:<桶名>/image/*"]
    },
    {
      "effect": "deny",
      "principal": { "qcs": ["qcs::cam::anyone:anyone"] },
      "action": ["name/cos:GetBucket", "name/cos:GetBucketObjectVersions"],
      "resource": ["qcs::cos:<地域>:uid/<APPID>:<桶名>/"]
    }
  ]
}
```

第二条是**禁止列出桶内文件**，否则任何人访问桶域名就能看到完整目录结构。

验证：浏览器直接打开 `https://<桶名>.cos.<地域>.myqcloud.com/image/xxx.jpg` 能显示，
而 `_data/album.json` 返回 403。

> 代价：知道 URL 的人就能拿到图。个人相册接受这个风险。
> 嫌流量被刷的话开「防盗链」，但注意防盗链会挡住部分正常访问。

### 1.3 配置 CORS（最容易踩坑的一步）

控制台 → 存储桶 → 安全管理 → 跨域访问 CORS 设置 → 添加规则

| 字段 | 值 |
| --- | --- |
| 来源 Origin | `https://你的域名` 和 `http://localhost:3000`（开发用，每行一个） |
| 操作 Methods | `GET, PUT, HEAD` |
| Allow-Headers | `*` |
| **Expose-Headers** | `ETag, x-cos-request-id, Content-Length` |
| 超时 Max-Age | `600` |

⚠️ **`Expose-Headers` 必须包含 `ETag`**。漏了会导致上传成功后前端拿不到 ETag，
表现为「上传成功但照片不出现」，且控制台无任何报错。

验证：

```bash
curl -i -X OPTIONS \
  "https://<bucket>-<appid>.cos.<region>.myqcloud.com/image/test.jpg" \
  -H "Origin: https://你的域名" \
  -H "Access-Control-Request-Method: PUT"
# 期望响应头含：Access-Control-Allow-Origin: https://你的域名
#              Access-Control-Allow-Headers: *
```

### 1.4 开通数据万象（缩略图依赖）

控制台 → 数据万象 CI → 开通服务 → 绑定上述存储桶 → 确认「图片基础处理」已开启

验证（先传一张真图到 `image/`，再逐个访问处理 URL）：

| 处理 | URL 参数 | 期望 |
| --- | --- | --- |
| 网格缩略 | `?imageMogr2/auto-orient/thumbnail/560x/format/webp/quality/80` | `Content-Type: image/webp` |
| 灯箱预览 | `?imageMogr2/auto-orient/thumbnail/1600x/format/webp/quality/85` | `Content-Type: image/webp` |
| 方形裁剪 | `?imageMogr2/auto-orient/crop/320x320/gravity/center/format/webp/quality/80` | `Content-Type: image/webp` |

> ⚠️ **别用手搓的极小 PNG 测**。CI 会返回
> `InvalidImageFormat: Invalid image format, we cannot process it`，
> 这是**图片本身不合法**，不是服务没开通 —— 容易被误判成没开通而白折腾。
> 判断依据：返回 `InvalidImageFormat` 说明 CI 已经在处理你的请求了，只是处理失败；
> 真没开通会返回 404 或权限错误。

### 1.5 创建最小权限子账号密钥

访问管理 CAM → 用户 → 新建子用户（编程访问）→ 绑定以下自定义策略，**不要给全量 AdministratorAccess**，
也**不要在 COS 控制台「存储桶访问权限」页给子账号授权** —— 那里的粒度只有
「数据读取 / 数据写入 / 权限读取 / 权限写入 / 完全控制」五档，其中「权限写入」
等于「可以修改这个权限设置本身」，签名服务完全不需要，且无法按前缀收敛。

正确做法是 CAM 自定义策略，关联到子账号：

```json
{
  "version": "2.0",
  "statement": [
    {
      "effect": "allow",
      "action": [
        "name/cos:PutObject",
        "name/cos:GetObject",
        "name/cos:DeleteObject",
        "name/cos:HeadObject"
      ],
      "resource": [
        "qcs::cos:<region>:uid/<appid>:<bucket>-<appid>/image/*",
        "qcs::cos:<region>:uid/<appid>:<bucket>-<appid>/_data/*",
        "qcs::cos:<region>:uid/<appid>:<bucket>-<appid>/_trash/*"
      ]
    }
  ]
}
```

拿到 `SecretId` / `SecretKey`，只写进 `services/signer/.env`，**永远不要提交进仓库**。

> **action 前缀的坑**：存储桶策略的官方示例一律写 `name/cos:GetObject`，
> 但 CAM 用户策略的官方示例里 `name/cos:` 和 `cos:` 两种写法都出现过。
> 本项目统一用 `name/cos:` 形式；若绑定后仍报权限不足，
> 改用 CAM 控制台的**图形化编辑**生成策略，它会输出当前版本认可的格式。

### 1.6 绑定自定义域名（强烈建议，越早越好）

2024 年 1 月 1 日后创建的桶**不支持用默认域名在浏览器直接预览文件**。
配置自定义域名 + CDN，可规避此限制并大幅降低流量成本：

控制台 → 存储桶 → 域名与传输管理 → 添加自定义域名（需先有备案域名）→ 开启 HTTPS
→ 开启「源站静态图片」并挂载缩略图处理规则。

> 没备案域名就先跳过，但要在 M2 前解决，否则 iOS Safari 上可能出现图片加载异常。

### 1.7 M0 产出

- [ ] 桶已建，CORS 已配且 `curl` 验证通过
- [ ] 存储桶策略已配：`image/*` 匿名可读、`GetBucket` 匿名被拒
- [ ] 数据万象已开通，缩略图 URL 验证通过
- [ ] 子账号密钥已生成，**最小权限** CAM 策略已关联并核对

```bash
# 真实值填进这两处，不要提交进仓库：
#   services/signer/.env          ← 密钥（已被 .gitignore 排除）
#   .env.local                    ← 构建期公开配置（已被 .gitignore 排除）
# 模板见 services/signer/.env.example 与 .env.local.example
COS_SECRET_ID=
COS_SECRET_KEY=
COS_BUCKET=saikongxu-album-125xxxxxxx
COS_REGION=ap-shanghai
ALBUM_ADMIN_PASSWORD_HASH=      # node -e "console.log(require('bcryptjs').hashSync('你的口令',10))"
NEXT_PUBLIC_COS_BASE_URL=https://saikongxu-album-125xxxxxxx.cos.ap-shanghai.myqcloud.com
NEXT_PUBLIC_SIGNER_URL=https://sign.你的域名
```

---

## 2. 阶段 M1：签名服务（1 天）

### 2.1 目录与依赖

```bash
mkdir -p services/signer/src
cd services/signer
npm init -y
npm i cos-nodejs-sdk-v5@^3.0.0 hono @hono/node-server bcryptjs
npm i -D typescript @types/node tsx
```

> `cos-nodejs-sdk-v5` 最新为 **3.0.0**（2026-07-10 发布，移除了 Node 6/7/8 支持）。
> 本机 Node v26.3.0，满足要求。v3 的 `getObjectUrl` / `putObject` API 与 v2 一致。

### 2.2 实现要点

| 文件 | 职责 |
| --- | --- |
| `src/cos.ts` | 初始化 COS 客户端、密钥仅在此读 `process.env` |
| `src/album.ts` | 读写 `_data/album.json`，实现 `revision` 乐观锁 |
| `src/auth.ts` | 口令校验 + 签发/校验会话 Cookie |
| `src/routes.ts` | 四个接口的 handler |
| `src/index.ts` | 启动 Hono，监听 8787 |

### 2.3 接口契约

```ts
// POST /api/sign  —— 鉴权：会话 Cookie
// 请求
{ files: [{ name: string, size: number, type: string }] }   // 最多 50 个
// 响应
{
  uploadId: string,
  items: [{ key: string, url: string, expiresAt: number }]   // url 为预签名 PUT，有效期 600s
}

// GET /api/album  —— 公开（只返回 visible && !trashedAt 的照片）
// 响应
{ revision, updatedAt, albums: Album[], photos: Photo[] }   // 带 ETag / Cache-Control: no-cache

// PUT /api/album  —— 鉴权 + 乐观锁
// 请求 { revision, albums, photos }
// 响应 { revision, updatedAt }
// 冲突时返回 409 { error: "stale_revision", currentRevision }

// DELETE /api/photo/:id  —— 鉴权，软删除（移入 _trash/）

// POST /api/login { password }   → Set-Cookie: session=...; HttpOnly; SameSite=Strict; Max-Age=2592000
// POST /api/logout                → 清除 Cookie
```

### 2.4 三个必须守住的规则

1. **对象键由服务端生成**，绝不信前端传来的 key。
   ```ts
   // 用 ulid 保证单调递增、文件名按年月分目录
   const key = `image/${new Date().getUTCFullYear()}/`
            + `${String(month + 1).padStart(2, "0")}/`
            + `${ulid()}-${slugify(name)}`;
   if (!key.startsWith("image/")) throw new Error("invalid key prefix");  // 防目录穿越
   ```

2. **预签名短有效期**。`Expires: 600`，配合限流，避免签名 URL 被长期盗用刷流量。

3. **密钥零泄漏**。`cos-nodejs-sdk-v5` 的 `getObjectUrl` 默认会把 `Host` 签进 URL，
   这正是我们要的（官方明确提示不要签 Host 会导致 403 或安全漏洞）。服务只把 `url` 返给前端，自身返回体里不含任何密钥字段。

生成预签名 URL 的核心代码：

```ts
const url = cos.getObjectUrl({
  Bucket, Region, Key: key,
  Method: "PUT", Sign: true, Expires: 600,
});
// 回调形式（推荐，避免同步/异步行为差异）
```

### 2.5 M1 验收

```bash
cd services/signer && npx tsx src/index.ts
# 终端 A
curl -X POST localhost:8787/api/login -H 'content-type: application/json' \
  -d '{"password":"你的口令"}' -c /tmp/ck.txt -i | grep -i set-cookie
# 终端 B —— 拿到签名后真的能传上去
KEY=$(curl -s -X POST localhost:8787/api/sign -b /tmp/ck.txt -H 'content-type: application/json' \
  -d '{"files":[{"name":"t.jpg","size":1000,"type":"image/jpeg"}]}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["items"][0]["key"])')
URL=$(curl -s -X POST localhost:8787/api/sign -b /tmp/ck.txt -H 'content-type: application/json' \
  -d '{"files":[{"name":"t.jpg","size":1000,"type":"image/jpeg"}]}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["items"][0]["url"])')
curl -i -X PUT "$URL" -H 'Content-Type: image/jpeg' --data-binary @某张真实图片.jpg | head -1
# 期望：HTTP/1.1 200 OK
```

---

## 3. 阶段 M2：上传后台（1.5 天）

### 3.1 需要新建/修改的文件

```
lib/cos-url.ts          【新增】COS URL 与 imageMogr2 参数构造（前端共享）
lib/album-types.ts      【新增】Photo / Album 类型
app/admin/page.tsx      【新增】后台页（"use client"）
app/admin/login/page.tsx【新增】口令登录页
components/admin/UploadDrop.tsx   【新增】拖拽区 + 文件队列
components/admin/Progress.tsx     【新增】单文件进度条
components/admin/PhotoRow.tsx     【新增】已传照片的行内编辑
app/globals.css 或 admin.module.css  【新增】后台样式（独立于前台视觉体系）
```

> 后台是工具界面，不必套用前台的极简排版；用高信息密度的列表 + 明确的操作反馈即可。

### 3.2 关键实现：URL 构造器（`lib/cos-url.ts`）

```ts
const BASE = process.env.NEXT_PUBLIC_COS_BASE_URL!;

/** 网格缩略图：EXIF 自动旋正 + 1:1 居中裁剪 + webp */
export const thumbUrl = (key: string) =>
  `${BASE}/${key}?imageMogr2/auto-orient/crop/320x320/gravity/center/format/webp/quality/80`;

/** 灯箱预览：EXIF 自动旋正 + 限宽 1600 等比 + webp */
export const previewUrl = (key: string) =>
  `${BASE}/${key}?imageMogr2/auto-orient/thumbnail/1600x/format/webp/quality/85`;

/** 原图：不加任何参数 */
export const originalUrl = (key: string) => `${BASE}/${key}`;
```

> 私有读的对象必须把 imageMogr2 参数一起签进 URL。
> 本方案把 `image/` 设为公有读，所以直接拼参数即可。

### 3.3 关键实现：上传队列（`components/admin/UploadDrop.tsx`）

用 `XMLHttpRequest` 而非 `fetch`，因为需要 `upload.onprogress` 拿真实上传进度：

```tsx
function putOne(url: string, file: File, onProgress: (p: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (e) =>
      e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300
      ? resolve() : reject(new Error(`HTTP ${xhr.status}`)));
    xhr.onerror = () => reject(new Error("network error"));
    xhr.send(file);
  });
}
```

调度：`files → 校验(createImageBitmap + 类型 + 大小) → POST /api/sign 批量取签名 → 并发池(3)逐个 PUT → 成功后收集 ETag → 一次性 PUT /api/album 写元数据`。

要点：
- 签名接口**一次签一批**（上限 50），不要一个文件一次请求。
- `createImageBitmap` 拿宽高，失败的文件直接标红跳过，不进队列。
- 并发池用最简实现即可，不要引入额外依赖。

### 3.4 M2 验收

1. `npm run dev` → `/admin` → 口令登录 → 拖入 20 张图
2. 20 张全部上传成功，进度条平滑推进
3. DevTools Network 可见 20 个 `PUT` 直发 `*.myqcloud.com`，**没有**任何请求经 localhost:3000 传输图片体
4. 刷新页面，已传列表仍在（数据来自 COS 而非内存）
5. 中途断网 → 失败项标红 → 点重试 → 成功

---

## 4. 阶段 M3：相册浏览（1.5 天）

### 4.1 需要新建的文件

```
app/album/page.tsx               【已建】页面壳 + 标题 + <Suspense> 已不需要
components/album/album.module.css【已建】页面 / 网格 / 筛选条样式
components/album/AlbumBrowser.tsx【已建】筛选条 + 瀑布网格 + 灯箱状态
components/album/Lightbox.tsx    【已建】全屏看片
components/album/Lightbox.module.css【已建】灯箱样式
lib/album-types.ts              【已建】Photo/Album 类型 + 图片 URL 构造
lib/album-mock.ts                【已建】演示数据，接 COS 后整个删掉
```

> 当前 `AlbumBrowser` 读的是 `lib/album-mock.ts`。接入签名服务后，
> 把 `const { albums, photos } = mockManifest;` 换成 `GET /api/album` 的结果即可，
> 组件其余部分一行都不用改。

### 4.2 ⚠️ 动态路由的坑（已验证的解法）

`next.config.ts` 是 `output: "export"`，而 Next 16 静态导出**不支持未配 `generateStaticParams()` 的动态路由**。

再加一个更隐蔽的坑：**用了 `useSearchParams` 的 Client Component，在静态导出下会被降级为纯客户端渲染**，
`out/album/index.html` 里只剩 `<Suspense>` 的 fallback，网格一个字都不会进 HTML —— 丢掉 SEO，也丢掉首屏内容。

正确解法（已在 `/album` 上验证通过）：

| 方案 | 做法 | 结论 |
| --- | --- | --- |
| **A（已采用）** | 单页 `/album` + `useState` 存当前 slug，切换时 `history.pushState` 改 `?album=slug` | ✅ 完整网格被预渲染进 HTML，URL 可分享、可前进后退 |
| B | `useSearchParams` + `<Suspense>` 包裹 | 能跑，但静态产物里没有网格内容 |
| C | 每个相册生成 `generateStaticParams()` | 相册是运行时创建的，构建时拿不到 → 每次加照片都要重新构建。不可行 |

补充：读 URL 时直接 `new URLSearchParams(window.location.search)`，并监听 `popstate` 接管前进/后退。
这样就不需要 `Suspense`，也不需要 `next/navigation` 的 `useRouter`。

> 代价：单个相册没有独立 URL，搜索引擎无法单独索引。缓解见 PRD 的 P1（构建时烘进首屏）。

### 4.3 网格与灯箱要点

- ⚠️ **`width` / `height` 元数据必须准确**，这是硬要求。网格按 `height/width` 算单元高度，
  再用 `object-fit` 填充。比例一旦对不上，照片就会被裁掉或留出黑边。
  COS 接入后这些值由上传时读取图片元数据写入 `album.json`，**不要让前端传、不要估**。
  （演示阶段就是这里翻的车：编的比例和真实图片对不上，全网格错位。）
- **懒加载**：`IntersectionObserver` 进入视口前 300px 才设 `src`，配 `loading="lazy"` 双保险
- **占位防抖动**：元数据里已有 `width`/`height`，用 `aspect-ratio` 占位，网格不会因图片到达而跳动
- **灯箱**：`←` `→` 翻页、`Esc` 退出、触摸滑动翻页；预加载相邻两张
- **下载原图**：`originalUrl(key)`，配 `download` 属性
- **键盘陷阱**：灯箱打开时锁定 body 滚动，关闭后恢复焦点到触发元素

> 单元高度向上取整到 6px 的倍数，必然有几像素误差。所以图片用 `object-fit: contain`：
> 误差表现为留边而不是裁掉构图。留边几像素远好过丢照片。

> ⚠️ **灯箱的图片不要用百分比尺寸。** `max-height: 100%` 会在容器高度解析不出来时
> 退化成 `none`；改成 `width/height: 100%` 也不够 —— grid 容器里行高为 `auto` 时，
> 居中的 grid item 拿不到确定高度。两种情况都不报错，图按原始像素铺出去。
>
> 实测：舞台 639×517，图片框却算成 562×844（溢出 327px），
> 1600×2400 的竖照只看得见顶部。
>
> 唯一可靠写法是**绝对定位**，不经过百分比：
> ```css
> .stage { position: relative; }
> .img   { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }
> ```
> 网格单元同理：包裹层用 `position: absolute; inset: 0`，别用 `height: 100%`。
>
> **怎么确认修好了**：别看截图，往组件里临时插一行
> `DBG box=${img.clientWidth}x${img.clientHeight} stage=${stage.clientWidth}x${stage.clientHeight}`，
> 要求 `box` 与 `stage` 完全相等。肉眼分不出「留边」和「裁切」的边界。

### 4.4 视觉一致性

现有站点是「至静之极」的极简黑白体系（`Bodoni_Moda` + `Noto_Serif_SC`，深底 `#1C1E22`）。
相册页应沿用同一套 token：深底、细边框、小字号 kicker（如 `— 相册 / 01`）、
照片之间大量留白。不要引入彩色、圆角卡片、阴影等通用图库风格。

### 4.5 M3 验收

1. `/album` 显示相册列表，封面正确
2. 进入某相册，全部照片可见，无破图
3. 缩略图 URL 含 `imageMogr2`，实际返回 webp 且宽 320
4. 灯箱键盘翻页、退出正常；相邻图预加载生效
5. 375px 视口无横向滚动
6. Lighthouse（移动端节流）LCP < 2.5s

---

## 5. 阶段 M4：数据迁移与收尾（0.5 天）

现有 `lib/data.ts` 的 `series`（5 组）与 Unsplash 图要迁到 COS：

```bash
# 下载现有 Unsplash 图 → 转存 COS → 生成元数据条目
# 一次性脚本，放在 scripts/migrate-series.mjs
node scripts/migrate-series.mjs
```

迁移后：
- `lib/data.ts` 的 `series` 保留（作品集页继续用它做静态精选）
- 新增 `lib/album-fallback.ts`：构建时若拿不到 COS 清单，回退到 `series`，保证 `/album` 永不空白
- `components/Works.tsx` 的 `ImageFallbackProvider` 可保留，作为最后一层兜底

发布：

```bash
npm run typecheck && npm run build
# 确认 out/album/index.html 与 out/admin/index.html 存在
```

部署沿用现有静态链路（`out/` 目录）。**上线前确认**：自定义域名已生效、签名服务已上线、
`/admin` 口令已改、CORS 已包含正式域名。

---

## 6. 任务清单（可直接认领）

| # | 任务 | 文件 | 依赖 |
| --- | --- | --- | --- |
| 1 | 建桶 / ACL / CORS / 数据万象 / 子账号密钥 | —（控制台） | — |
| 2 | 签名服务骨架 + 登录鉴权 | `services/signer/src/{index,auth}.ts` | 1 |
| 3 | 预签名上传接口 | `services/signer/src/routes.ts` | 2 |
| 4 | 元数据读写 + 乐观锁 | `services/signer/src/album.ts` | 3 |
| 5 | URL 构造器与类型 | `lib/cos-url.ts`, `lib/album-types.ts` | 1 |
| 6 | 后台登录页 | `app/admin/login/page.tsx` | 2 |
| 7 | 上传区 + 并发队列 | `components/admin/UploadDrop.tsx` | 3, 5 |
| 8 | 已传列表与元数据编辑 | `components/admin/PhotoRow.tsx` | 4 |
| 9 | 回收站 | `services/signer` DELETE + `app/admin` | 4 |
| 10 | 相册列表页 | `app/album/page.tsx` | 4, 5 |
| 11 | 网格 + 懒加载 | `components/album/AlbumGrid.tsx` | 10 |
| 12 | 灯箱 | `components/album/Lightbox.tsx` | 11 |
| 13 | 现有 5 组作品迁移 | `scripts/migrate-series.mjs` | 3, 4 |
| 14 | 构建、验收、发布 | — | 全部 |

**关键路径**：1 → 2 → 3 → 7 → 11 → 12。任务 1 不完成，后面全部卡住。

---

## 7. 明确不在本次范围

- 多用户 / 注册 / 权限矩阵
- 访客上传与分享
- 视频、动图、GIF 专门处理
- EXIF 解析与地图标记
- 图片编辑（裁剪、滤镜、水印）
- 相册密码保护
- 用数据库替换 `_data/album.json`（触发条件见 PRD 第 4 节）

---

## 8. 已知环境问题（2026-10 实测）

| 问题 | 现象 | 处理 |
| --- | --- | --- |
| **Turbopack 构建失败** | `next build` 报 24 个 `Can't resolve '@vercel/turbopack-next/internal/font/google/font'`，`node_modules` 里根本没有这个包，lockfile 里也没有 | 改用 `npx next build --webpack`。字体其实拉得到（Google Fonts 可达），是 Turbopack 侧的问题。与页面代码无关。 |
| **`typecheck` 报 `LayoutProps<"/">` 不满足 `never`** | `app/layout.tsx` 的 `LayoutProps<"/">` 报错 | **既有问题，不是本次改动引入的**。已用 `git stash` 在完全干净的原始代码上复现。属 Next 16.3.7 与 TS 版本的环境问题。**构建本身通过**，部署不受影响。 |
| **`.next/dev/types` 与 `.next/types` 冲突** | tsconfig 的 `**/*.ts` 会把两份全局路由类型都收进去，dev 版 `routes.d.ts` 里 `LayoutRoutes = never` 会污染 `LayoutProps` | `exclude` 加 `.next/dev`；跑完 build 后删掉 `tsconfig.tsbuildinfo` 再 typecheck |
| **npm 缓存不可写** | `npm install` 报 `EPERM: unlink .npm/_cacache/tmp` | `npm install --cache "$TMPDIR/npm-cache"` 可绕开 |
| **`tsx` 在沙箱里起不来** | `tsx` 要在 `$TMPDIR` 建 IPC unix socket，被拦，报 `listen EINVAL` | 改用 `npm run build && node dist/index.js`。因此 tsconfig 拆两份：`noEmit` 用于 typecheck，`tsconfig.build.json` 关掉 `noEmit` 产出 `dist/` |
| **`/node_modules` 前导斜杠** | gitignore 里 `/node_modules` 只匹配根目录，`services/signer/node_modules` 会被提交进去 | 改成 `node_modules/`（无斜杠，任意层级匹配） |

---

## 8.1 COS 排查判读表

排查期实测得出，**别凭报错措辞猜**：

| 报错 | 确切含义 |
| --- | --- |
| `InvalidAccessKeyId` | 密钥不存在，或不属于该桶的 APPID。**与权限无关**，改策略没用 |
| `AccessDenied` | 密钥有效，但缺该操作权限 → 去查 CAM 策略关联 |
| `NoSuchKey`（**而非 403**） | 鉴权 + 权限**都已通过**，只是那个键不存在。这是区分「密钥问题」和「权限问题」的关键信号 |
| `InvalidImageFormat` | 数据万象在处理了，只是这张图不合法 → CI 是通的 |

查密钥归属身份（临时装 `tencentcloud-sdk-nodejs` 调 STS，用完卸掉）：

```js
new StsClient({ credential: { secretId, secretKey } }).GetCallerIdentity()
// → { AccountId: 主账号, UserId: 子账号, Type: "CAMUser" }
```

比对 `UserId` 与 COS 控制台授权的子账号 ID 是否一致 —— 不一致就是授权给了别人。

---

## 9. 开工前需要确认的 3 个参数

| 参数 | 说明 | 影响 |
| --- | --- | --- |
| `COS_REGION` / `BUCKET` / `APPID` | 建桶后回填 | 全部 URL |
| 正式域名 | 是否已备案 | CORS 配置、CDN、2024 后新桶的预览限制 |
| 签名服务部署位置 | 腾讯云 SCF / CloudBase 云函数 / 现有服务器 | 是否有 HTTPS 域名供前端调用 |

前两项完成后即可开始任务 1；第三项可以先用本地 `localhost:8787` 开发，不阻塞。
