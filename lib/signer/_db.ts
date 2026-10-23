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

/**
 * 执行一条 DDL，SQLITE_BUSY（database is locked）时退避重试。
 *
 * build 时 N 个 worker 并发加载本模块 → 每个都跑 DDL/迁移 →
 * `PRAGMA journal_mode = WAL` 与 ALTER TABLE 要写锁，后到的会撞
 * SQLITE_BUSY。先到的 worker 建完表，后到的 CREATE TABLE IF NOT
 * EXISTS / PRAGMA table_info 检测直接跳过。
 */
export function execWithRetry(sql: string): void {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      db.exec(sql);
      return;
    } catch (e) {
      const msg = String((e as { message?: string }).message ?? e);
      const locked = msg.includes("locked") || msg.includes("busy");
      if (!locked || attempt === 4) throw e;
      /* 同步退避：模块顶层不能 await。Atomics.wait 阻塞当前线程，
         但这里进程还没起事件循环，等价于 sleep。 */
      const waitMs = 50 * 2 ** attempt;
      Atomics.wait(
        new Int32Array(new SharedArrayBuffer(4)),
        0,
        0,
        waitMs,
      );
    }
  }
}

/**
 * 加列 —— 并发安全。
 *
 * build 时 N 个 worker 并发加载本模块，每个都跑一遍迁移。「先查列在不在，
 * 再 ALTER」这招在并发下会漏：两个 worker 可能**同时**查到列不存在，
 * 然后都去 ALTER，后到的那个撞 `duplicate column name: xxx` ——
 * 那不是 SQLITE_BUSY，execWithRetry 不会重试，直接抛出去，
 * build 挂在「Collecting page data」阶段。
 *
 * （真实事故：2026-10-23 的 CI 就是这么随机红的 —— 上一轮绿、这一轮红，
 *  取决于 worker 的调度时序。）
 *
 * 所以：查一次（快路径），ALTER 时把「duplicate column name」当成功 ——
 * 别的 worker 刚加上了，结果是一样的。
 */
export function addColumnIfMissing(
  table: string,
  column: string,
  ddl: string,
): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as {
    name: string;
  }[];
  if (cols.some((c) => c.name === column)) return;
  try {
    execWithRetry(ddl);
  } catch (e) {
    const msg = String((e as { message?: string }).message ?? e);
    if (!msg.includes("duplicate column name")) throw e;
    /* 别的 worker 刚加过这一列 —— 等价于成功 */
  }
}