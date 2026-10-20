/**
 * SQLite 单例 —— 与 users.ts / site-content.ts 共享同一连接
 * ------------------------------------------------------------------
 * 拆出的原因：site_content 表跟 users / security_log 同库；两个模块
 * 各自 new DatabaseSync 会出现并发写竞争（WAL 模式允许多读单写，但
 * 同 connection 间隔离最好）。
 *
 * ⚠️ 本文件只被 signer/* 内部 import；外部代码请走 users.ts 或
 * site-content.ts 的导出函数，不要直接拿 db。
 */
// @ts-expect-error node:sqlite 是 Node 22+ 内置模块，@types/node 20 还没声明
import { DatabaseSync } from "node:sqlite";
import * as fs from "node:fs";
import * as path from "node:path";

export const DB_PATH = process.env.USERS_DB_PATH
  ? path.resolve(process.env.USERS_DB_PATH)
  : path.join(process.cwd(), "data", "users.db");

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);