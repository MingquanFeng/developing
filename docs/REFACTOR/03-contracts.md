# 公共类型契约迁移日志（PR-1 后）

## 改动一览

| 类型 | 原位置 | 新位置 | 兼容路径（6 个月内） |
|---|---|---|---|
| `Album` | `lib/album-types.ts` + `lib/signer/album.ts` 各一份 | `lib/contracts.ts` | `@/lib/album-types`、`@/lib/signer/album` re-export |
| `Photo` | 同上 | 同上 | 同上 |
| `Manifest` | `lib/signer/album.ts`（名 `Manifest`）、`lib/album-types.ts`（名 `AlbumManifest`） | `lib/contracts.ts` | 同上；`AlbumManifest` 别名保留 |
| `User`（含 passwordHash） | `lib/signer/users.ts` | `lib/contracts.ts` | `@/lib/signer/users` re-export（**服务端绝密**，不应被前端 import） |
| `PublicUser` | `lib/album-client.ts` + `lib/signer/users.ts` 各一份 | `lib/contracts.ts` | `@/lib/album-client`、`@/lib/signer/users` re-export |
| `Role` | `lib/signer/users.ts` | `lib/contracts.ts` | 同上 |
| `SessionToken` | `lib/signer/auth.ts` | `lib/contracts.ts` | `@/lib/signer/auth` re-export |
| `WriteResult` | `lib/signer/album.ts` | `lib/contracts.ts`（去掉了内层 `reason: "stale_revision"`，等价于 `current: Manifest` 即可表达） | `@/lib/signer/album` re-export |
| `ResetLinkResponse` | `lib/album-client.ts`（含 `url/expiresAt/ttlSec/targetUsername`），与 `app/api/users/[id]/reset-link/route.ts` 的实际响应 | `lib/contracts.ts`（同形状） | `@/lib/album-client` re-export |

## 删除的内层冗余字段

`WriteResult` 在原 `lib/signer/album.ts` 失败分支有 `{ ok: false; reason: "stale_revision"; current: Manifest }`。

实际应用层（API route handler / AdminApp）只读 `current.revision`，不读 `reason`。

PR-1 把 `reason` 字段去掉，仅留 `{ ok: false; current: Manifest }`，更贴近 contracts 的错误结构。语义不变。
