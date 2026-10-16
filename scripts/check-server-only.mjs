#!/usr/bin/env node
/**
 * check-server-only.mjs —— 守门自检，验证 lib/series-covers server-only 真的生效
 * ------------------------------------------------------------------
 * 在 components/Nav.tsx 临时插入 import "server-only"，跑 next build，
 * 期望 webpack 报「This API is only available in Server Components」。
 *
 * 用法：node scripts/check-server-only.mjs
 *
 * 实现：
 *   1. 备份 Nav.tsx
 *   2. 写入测试代码（含 import "server-only"）
 *   3. 跑 next build --webpack，从 stderr 提取错误信号
 *   4. 不论成功失败，把备份恢复回去（不管 build 会不会成功）
 *
 * 退出码：
 *   0 = 守门生效（build 因 server-only 报错）
 *   1 = 守门失效（build 没报错；或者 Nav 出现意外的别处问题）
 *   2 = 自检过程错误
 *
 * 这段实操验证在 PR-2 第一次跑过：Nav 临时加 'import server-only' 让 build
 * 红出 "This API is only available in Server Components"，证明守门有效。
 * 见 docs/REFACTOR/02-home.md。
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const NAV = join(ROOT, "components/Nav.tsx");
const BACKUP = NAV + ".server-only-backup";

if (!existsSync(NAV)) {
  console.error("找不到 components/Nav.tsx"); 
  process.exit(2);
}

/* 备份原文件 */
copyFileSync(NAV, BACKUP);

/* 临时在 Nav 顶部插一行 import "server-only" */
const original = readFileSync(NAV, "utf8");
const probe = `"use client";\n\nimport "server-only";\n/* 守门探针 —— 此文件不应通过 server-only import */\n\n` + original.split("\n").slice(2).join("\n");
writeFileSync(NAV, probe);

try {
  /* 跑 build。'--webpack' 是项目已知要求（README "已知问题"） */
  const result = spawnSync("npx", ["next", "build", "--webpack"], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 240_000,
  });

  const out = (result.stdout ?? "") + "\n" + (result.stderr ?? "");
  const guardFired = /server-only.*cannot be imported|This API is only available in Server Components|server-only.*client/i.test(out);

  if (guardFired) {
    console.log("check-server-only: 守门生效（Nav 加 'import \"server-only\"' 后 build 拒绝）");
    process.exit(0);
  }
  if (result.status === 0) {
    console.error("check-server-only: 守门失效！Nav 加 'import \"server-only\"' 后 build 没拒绝");
    console.error("最近 30 行 build 输出:");
    console.error(out.split("\n").slice(-30).join("\n"));
    process.exit(1);
  }
  /* build 因为别的原因（sqlite lock / 环境问题）失败 —— 不计入守门测试 */
  console.error("check-server-only: build 失败但与 server-only 守门无关（可能是 sqlite lock）。");
  console.error("最近 30 行 build 输出:");
  console.error(out.split("\n").slice(-30).join("\n"));
  process.exit(2);
} finally {
  /* 不管结果 —— restore original */
  copyFileSync(BACKUP, NAV);
  try {
    unlinkSync(BACKUP);
  } catch {
    /* ignore */
  }
  console.log(`已恢复 ${relative(ROOT, NAV)}`);
}
