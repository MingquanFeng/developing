# 首页架构说明（PR-2 + PR-3 后）

## 目标

首页（`/`）跑在 Next.js 静态导出（`output: "export"`）模式下，构建期渲染成纯 HTML。重构目标是把：

- 数据来源（`lib/data.ts` 290 行单文件）按业务域拆开；
- 九幕视觉节奏各为独立 server component（`components/home/*Section.tsx`），便于单独 review 与未来 CMS 接入；
- 后端 IO（`lib/signer/*`）通过唯一服务端入口（`lib/series-covers`）走 `import "server-only"` 守住客户端 bundle 不污染。

## 三层结构

### 第一层 — `lib/data/` 站点文案数据源（PR-3 上半）

```
lib/data/
├── site.ts          site / nav (顶部)
├── nav.ts           nav / SECTION_IDS
├── home.ts          hero / interlude01 / interlude03 / series / coords / FALLBACK_IMAGES
├── story.ts         story（主推故事）
├── about.ts         about
├── subscribe.ts     subscribe
├── footer.ts        footer
└── index.ts         barrel —— 老 import `@/lib/data` 仍可用
```

按业务域拆。`as const` 保留，组件层用 props 接数据，**不再** 直接 `import { ... } from "@/lib/data"` 后即用。

#### 例外：保留的兼容路径

`lib/album-types.ts` 与 `lib/album-client.ts` 里仍分别 re-export 了 `Album` / `Photo` / `Manifest` / `PublicUser` —— 这些是历史 import 路径，**遵守 6 个月兼容窗口**（PR-1 注释）。新代码请走 `lib/contracts.ts`。

### 第二层 — 九幕 `components/home/*Section.tsx`

九幕 section 文件在 `components/home/`，每个文件**取该幕数据 + 渲染原组件**：

| 文件 | 幕 | 数据 | 调谁 |
|---|---|---|---|
| `HeroSection.tsx` | 01 HERO | `hero`（自取，Hero 内部 import） | `<Hero />` |
| `JournalSection.tsx` | 02 手记 01 | `interlude01` | `<Interlude id="journal" ...>` |
| `WorksSection.tsx` | 03 WORKS | **props 接收被增强的 series** | `<Works series={series}/>` |
| `CoordsSection.tsx` | 04 手记 02 | `coords`（Coords 自取） | `<Coords />` |
| `StorySection.tsx` | 05 STORY | `story` | `<Story />` |
| `Interlude03Section.tsx` | 06 手记 03 | `interlude03` | `<Interlude variant="minimal" />` |
| `AboutSection.tsx` | 07 ABOUT | `about` | `<About />` |
| `SubscribeSection.tsx` | 08 SUBSCRIBE | `subscribe` | `<Subscribe />` |
| `FooterSection.tsx` | 09 FOOTER | `footer`（Footer 自取） | `<Footer />` |

**唯一接 props 的是 `WorksSection`**：因为 series 经 `lib/series-covers` 在 server 层增强后，图片 URL 被替换成 COS 签名直链，必须显式传下去。其余 section 让原组件保持"自取数据"行为，零改动、零风险。

九幕 id（`#hero`、`#journal`、`#locations`、`#works`、`#story`、`#about`、`#contact`）必须与 `lib/data/nav.ts` 的 `SECTION_IDS` 顺序一一对应——这是 Navigation 顶部 "01 / 09" 计数与滚动定位的锚。**改其一要同步另一**。

### 第三层 — `lib/series-covers` server-only 守门（PR-2 上半）

```
lib/series-covers/index.ts
├── import "server-only";                ← 唯一允许 import signer 的入口
├── enrichSeriesWithCovers(items, deps?) ← 4 分支都静默兜底
├── pickFallback(photos, albumId, adminId)  ← 纯函数
└── safeGetFirstAdminId(fn)              ← 吞 SQLite 损坏
```

依赖通过参数注入：

```
deps: {
  readManifest?: () => Promise<Manifest>;
  presignGet?: (key, opts) => Promise<string>;
  getFirstAdminId?: () => string | null;
}
```

默认从 `lib/signer/*` 取；PR-6 起写单测时用 stub 替换，不必 mock `node:sqlite` 与 COS。

#### `server-only` 守门实测

PR-2 实施时实测：在 `components/Nav.tsx`（client component）临时加 `import "server-only"`，跑 `next build --webpack`，webpack 报：

```
x You're importing a module that depends on "server-only".
  This API is only available in Server Components in the App Router,
  but you are using it in the Pages Router.
  6 | // 守门自检
  8 | import "server-only";
```

证实：client component 一旦 import 这个模块，next build 直接失败，避免 `node:sqlite` / `cos-nodejs-sdk-v5` 被拖进 client bundle。

守门脚本：`scripts/check-server-only.mjs`（可选 —— 重跑整套 build，仅本地维护用）。

## 文件边界表

| 文件 | 角色 | 依赖 |
|---|---|---|
| `app/page.tsx` | server component 编排 | 仅引 server-only 边界 + 9 个 section 组件 |
| `lib/series-covers/index.ts` | 服务端封面取数 | `@/lib/signer/*`（**唯一**允许） |
| `lib/signer/*` | Node-only 业务 | `node:sqlite`、`cos-nodejs-sdk-v5` |
| `components/home/*Section.tsx` | server component 包装 | 各幕数据 |
| `lib/data/*.ts` | 文案纯数据 | 零依赖 |

## 如何未来加新幕

1. `components/home/NewSection.tsx`，`import NewComp from "@/components/NewComp"`
2. `lib/data/<domain>.ts` 增加对应数据
3. `app/page.tsx` 的九幕中插入 `<NewSection />`
4. 必要时 `lib/data/nav.ts` 的 `SECTION_IDS` 加对应 id

## 如何接 CMS

把 `lib/data/<domain>.ts` 的 `export const` 改成 `export async function getXxx()`，内部 `fetch(cms/api/...)`。组件层保持 props 接数据 —— section 文件已经准备好：
- `HeroSection` 改 `<Hero hero={await getHero()} />`
- `WorksSection` 同样改 props 形式
- 其余 section 自取的模式同样改成 props 即可

零业务改动。
