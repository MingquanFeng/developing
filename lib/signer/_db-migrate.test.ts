/**
 * addColumnIfMissing 的并发安全单测
 * ------------------------------------------------------------------
 * 背景（真实事故 2026-10-23）：build 期「Collecting page data」会起
 * N 个 worker 并发加载 signer 模块，每个都跑一遍迁移。原来的写法是
 * 「先 PRAGMA table_info 查列在不在 → 不在就 ALTER」—— 并发下会漏：
 * 两个 worker 可能**同时**查到列不存在，然后都去 ALTER，后到的撞
 * `duplicate column name: xxx`。那不是 SQLITE_BUSY，execWithRetry 不会
 * 重试，直接抛出去 → build 挂在 Collecting page data 阶段。
 *
 * 症状是**随机**的：上一轮 CI 绿、这一轮红，取决于 worker 调度时序。
 * 所以这个测试用真进程去抢同一个 DB 文件（mock 测不出这个）。
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** 被测模块的绝对路径 —— 子进程直接 import 它（它只依赖 node 内置模块，
 *  没有项目内 alias，所以裸 node 跑得起来） */
const DB_MODULE = path.join(HERE, "_db.ts");

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "db-migrate-test-"));

/** 子进程脚本：import 被测模块 → 调一次加列迁移 → 正常退出 */
const CHILD_SCRIPT = path.join(TMP_DIR, "child.mjs");
fs.writeFileSync(
  CHILD_SCRIPT,
  `const [, , dbModule, table, column, ddl] = process.argv;
const { addColumnIfMissing } = await import(dbModule);
addColumnIfMissing(table, column, ddl);
process.stdout.write("OK");
`,
  "utf-8",
);

/** Node 22.18+ / 23+ 默认开类型剥离；老版本要显式加 flag */
const STRIP_FLAG = process.allowedNodeEnvironmentFlags.has(
  "--experimental-strip-types",
)
  ? ["--experimental-strip-types"]
  : [];

function runChild(
  dbPath: string,
  args: string[],
): Promise<{ code: number | null; out: string; err: string }> {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [...STRIP_FLAG, CHILD_SCRIPT, DB_MODULE, ...args],
      {
        env: {
          ...process.env,
          USERS_DB_PATH: dbPath,
          /* 顺带把 signer 需要的其它 env 备齐（config.ts 会校验） */
          COS_BUCKET: "test",
          COS_REGION: "test",
          COS_SECRET_ID: "test",
          COS_SECRET_KEY: "test",
          SESSION_SECRET: "t".repeat(16),
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => {
      out += String(d);
    });
    child.stderr.on("data", (d) => {
      err += String(d);
    });
    child.on("close", (code) => resolve({ code, out, err }));
  });
}

/** 建一个只有 users 表（无目标列）的 DB */
async function freshDb(name: string): Promise<string> {
  const p = path.join(TMP_DIR, `${name}.db`);
  // @ts-expect-error node:sqlite 是 Node 22+ 内置模块，@types/node 20 还没声明
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(p);
  db.exec("CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT)");
  db.close();
  return p;
}

async function columnsOf(dbPath: string): Promise<string[]> {
  // @ts-expect-error node:sqlite 是 Node 22+ 内置模块，@types/node 20 还没声明
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(dbPath);
  const cols = db.prepare("PRAGMA table_info(users)").all() as {
    name: string;
  }[];
  db.close();
  return cols.map((c) => c.name);
}

afterAll(() => {
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
});

describe("addColumnIfMissing", () => {
  it("列不存在 → 加上", async () => {
    const dbPath = await freshDb("add");
    const r = await runChild(dbPath, [
      "users",
      "last_login_ip",
      "ALTER TABLE users ADD COLUMN last_login_ip TEXT",
    ]);
    expect(r.code).toBe(0);
    expect(r.err).not.toContain("duplicate column name");
    expect(await columnsOf(dbPath)).toContain("last_login_ip");
  });

  it("列已存在 → 什么都不做，也不抛", async () => {
    const dbPath = await freshDb("idem");
    const args = [
      "users",
      "last_login_ip",
      "ALTER TABLE users ADD COLUMN last_login_ip TEXT",
    ];
    expect((await runChild(dbPath, args)).code).toBe(0);
    /* 再来一次：这次查得到列，直接返回 */
    const second = await runChild(dbPath, args);
    expect(second.code).toBe(0);
    expect(second.err).not.toContain("duplicate column name");
  });

  it("竞态：检查之后、ALTER 之前列被别人加上了 → 不抛", async () => {
    /* 用「检查项的名字 ≠ DDL 实际加的列」来**确定性地**复现那个窗口：
       检查项永远查不到 → 每次都走到 ALTER → 第二次 ALTER 必然撞
       duplicate column name。修好之后它应当被当成成功吞掉。 */
    const dbPath = await freshDb("race");
    const args = [
      "users",
      "__never_created__", // 检查项：故意给一个不存在的列名
      "ALTER TABLE users ADD COLUMN last_login_ip TEXT",
    ];
    const first = await runChild(dbPath, args);
    expect(first.code).toBe(0);

    const second = await runChild(dbPath, args);
    /* 这次 ALTER 一定撞了 duplicate column name —— 但它被**吞掉**了：
       stderr 干净、进程正常退出。（没修的话这里会 exit 1 并把
       "duplicate column name" 抛到 stderr，build 就挂在
       Collecting page data 阶段。） */
    expect(second.code).toBe(0);
    expect(second.err).not.toContain("duplicate column name");
    /* 列没被加出第二份 */
    expect(
      (await columnsOf(dbPath)).filter((c) => c === "last_login_ip"),
    ).toHaveLength(1);
  });

  it("多进程真并发加同一列 → 谁都不失败", async () => {
    const dbPath = await freshDb("concurrent");
    const args = [
      "users",
      "last_login_ip",
      "ALTER TABLE users ADD COLUMN last_login_ip TEXT",
    ];
    const results = await Promise.all(
      Array.from({ length: 8 }, () => runChild(dbPath, args)),
    );
    for (const r of results) {
      expect(r.code).toBe(0);
      expect(r.err).not.toContain("duplicate column name");
    }
    expect(await columnsOf(dbPath)).toContain("last_login_ip");
  });
});
