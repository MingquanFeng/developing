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
 *   1. 校验 Nav.tsx 干净（git diff HEAD 0 修改），不干净直接退出
 *   2. 备份：拷 HEAD 版 Nav.tsx 到 BACKUP（不是当前文件）
 *   3. 写入 probe 代码
 *   4. 跑 next build --webpack，从 stderr 提取错误信号
 *   5. 不论成功 vs 失败，从 BACKUP 恢复（BACKUP 是 HEAD 版 → 始终恢复成 HEAD）
 *
 * 退出码：
 *   0 = 守门生效（build 因 server-only 报错）
 *   1 = 守门失效（build 没报错；或者 Nav 出现意外的别处问题）
 *   2 = 自检过程错误（Nav 不干净 / Git 不可用 / 找不到 Nav.tsx 等）
 *
 * 历史坑：v1 备份策略是「拷当前文件 → 恢复」，如果上一次跑因别的原因没
 * 走完 finally（比如 SIGINT），Nav.tsx 会卡在 probe 中间态；下次再跑时
 * 备份本身就是污染态，恢复后还是污染态。修复后改拷 HEAD 版 + 校验干净。
 *
 * 这段实操验证在 PR-2 第一次跑过：Nav 临时加 'import server-only' 让 build
 * 红出 "This API is only available in Server Components"，证明守门有效。
 * 见 docs/REFACTOR/02-home.md。
 */
import { spawnSync, execFileSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const NAV_REL = "components/Nav.tsx";
const NAV = join(ROOT, NAV_REL);
const BACKUP = NAV + ".server-only-backup";

/* ---------- 守门前置：Nav.tsx 必须干净 ---------- */
function exitWith(msg, code) {
  console.error(`check-server-only: ${msg}`);
  process.exit(code);
}

if (!existsSync(NAV)) {
  exitWith(`找不到 ${NAV_REL}`, 2);
}

let dirtyCheck;
try {
  dirtyCheck = spawnSync("git", ["diff", "--quiet", "HEAD", "--", NAV_REL], {
    cwd: ROOT,
    encoding: "utf8",
  });
} catch (e) {
  exitWith(`git 不可用: ${e.message}`, 2);
}
if (dirtyCheck.status === 1) {
  exitWith(
    `${NAV_REL} 有未提交修改。请先 \`git commit\` 或 \`git restore -- ${NAV_REL}\` 再跑守门。`,
    2,
  );
}
if (dirtyCheck.status !== 0) {
  exitWith(`git diff 异常: status=${dirtyCheck.status}`, 2);
}

/* ---------- 备份：拷 HEAD 版（不是当前文件），避免上一次的中间态污染 ---------- */
let headContent;
try {
  headContent = execFileSync("git", ["show", `HEAD:${NAV_REL}`], {
    cwd: ROOT,
    encoding: "utf8",
  });
} catch (e) {
  exitWith(`读 HEAD 版 ${NAV_REL} 失败: ${e.message}`, 2);
}
writeFileSync(BACKUP, headContent);

/* 临时把 Nav 改造成 "use client" + import "server-only", probe server-only 守门.
   设计意图: server-only 只允许 server component 引用, 在 client component 里
   import 应该被 build 拒绝. Nav 自身是 server component, 必须先 prepend
   "use client"; 把它伪装成 client, 才能让 server-only 拒绝有"对照".

   历史坑:
   - v1 用 original.split("\n").slice(2).join("\n") 假设 Nav 第一行是
     "use client", fc6eb21 后 Nav 改成 server component, slice(2) 把
     /** 注释开头吃掉了, probe 自带 syntax error, 守门默默失效.
   - v2 改成 findIndex("use client") + 在其后插入 import, 不修改注释结构.
     但忽略了 v1 同时 prepend "use client"; 把 Nav 强制转 client 这一关键步骤. */
const original = readFileSync(NAV, "utf8");
const lines = original.split("\n");
const idx = lines.findIndex((l) => /^["']use client["'];?$/.test(l.trim()));
const PROBE_DIRECTIVE = `"use client";`;
const PROBE_IMPORT = `import "server-only";`;

let probeLines;
if (idx >= 0) {
  /* 已经有 "use client" directive: 在它后面插 import, 不引入重复 directive. */
  probeLines = [...lines];
  probeLines.splice(idx + 1, 0, PROBE_IMPORT);
} else {
  /* 没有 "use client": prepend "use client" + import, 把 Nav 强制变 client component.
     这是 server-only 守门能 fire 的前提 —— 仅在 server component 里 import
     server-only 是 no-op, 不会触发拒绝. */
  probeLines = [PROBE_DIRECTIVE, PROBE_IMPORT, ...lines];
}
writeFileSync(NAV, probeLines.join("\n"));

let exitCode = 2;
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
    exitCode = 0;
  } else if (result.status === 0) {
    /* 历史坑：v1 这里 process.exit(1), finally 不跑, Nav.tsx 永远卡在
       probe 态 (HEAD 多一行 import "server-only")。v2 把 exit code 存到
       变量, 让 finally 跑完再统一 process.exit。 */
    console.error("check-server-only: 守门失效！Nav 加 'import \"server-only\"' 后 build 没拒绝");
    console.error("最近 30 行 build 输出:");
    console.error(out.split("\n").slice(-30).join("\n"));
    exitCode = 1;
  } else {
    /* build 因为别的原因（sqlite lock / 环境问题）失败 —— 不计入守门测试 */
    console.error("check-server-only: build 失败但与 server-only 守门无关（可能是 sqlite lock）。");
    console.error("最近 30 行 build 输出:");
    console.error(out.split("\n").slice(-30).join("\n"));
    exitCode = 2;
  }
} finally {
  /* 不管结果 —— restore HEAD 版（不是从 probe 期间的 Nav 拷回去）。
     BACKUP 文件里的内容是 HEAD 版, 这样即使 finally 被 SIGINT 跳过,
     下次跑守门时 BACKUP 仍然干净。 */
  copyFileSync(BACKUP, NAV);
  try {
    unlinkSync(BACKUP);
  } catch {
    /* ignore */
  }
  console.log(`已恢复 ${relative(ROOT, NAV)}`);
}

/* finally 之后才退出 —— 保证 Nav 一定被还原。 */
process.exit(exitCode);
