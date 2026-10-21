/**
 * node:sqlite 的 vitest shim
 * ------------------------------------------------------------------
 * 为什么需要：vite 5 的 builtin 列表里没有 `sqlite`（Node 22+ 才加的
 * 内置模块），它把 `node:sqlite` 剥掉前缀当 npm 包 `sqlite` 解析，
 * 报 "Failed to load url sqlite"。
 *
 * 做法：vitest.config.ts 里把 `node:sqlite` alias 到本文件；本文件用
 * createRequire 走 Node 原生 require 拿到真模块，再具名导出。
 *
 * 只在 vitest 下生效 —— 生产构建由 Next.js 自己的 loader 处理
 * node:sqlite，不走这里。
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/* node:sqlite 是 ESM+CJS 双模；require 拿到的是 CJS 视图 */
const sqlite = require("node:sqlite") as {
  DatabaseSync: new (path: string, options?: unknown) => unknown;
};

export const DatabaseSync = sqlite.DatabaseSync;
export default sqlite;