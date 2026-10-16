#!/usr/bin/env node
/**
 * lint-api-paths.mjs —— 防 fetch(`/api/*`) 回退
 * ------------------------------------------------------------------
 * 重构后所有调 /api/* 的客户端代码必须在 lib/admin-api/ 里集中。
 * 业务组件（含 admin/ 的 hooks 子组件）一旦出现裸 fetch(`/api/...`)
 * 就是回退的信号。
 *
 * 用法：node scripts/lint-api-paths.mjs
 *
 * 实现：grep 通配的业务目录（components/admin、components/album 等），
 * 排除 lib/admin-api 自身的源码。
 *
 * 退出码：
 *   0 = 干净，没有违规
 *   1 = 有违规，打印命中行；CI 红
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();

/** 业务代码目录：组件、页面、hooks（不含 lib/admin-api） */
const SEARCH_DIRS = [
  "components",
  "app",
  "lib/album-client.ts",
  "lib/album-types.ts",
  "lib/data",
  "lib/series-covers",
];

/** 这一个目录允许出现 /api 路径（SDK 自身） */
const ALLOW_DIR = "lib/admin-api";

/** 这一个文件允许 fetch /api/（admin SDK 的 client.ts 拼接 base） */
const ALLOW_FILE = `${ALLOW_DIR}/`;

/**
 * 白名单：访客/账户侧的裸 fetch。
 * PR-6 重新阶段化时迁到 lib/account-api/ 与 lib/public-api/，届时清空。
 * 详见 docs/REFACTOR/04-architecture.md §遗留。
 */
const ALLOWLIST = new Set([
  "components/Nav.tsx",        // 访客顶栏：session / logout；未来迁 lib/public-api
  "app/account/AccountForm.tsx", // 账户页：session / logout；未来迁 lib/account-api
  "app/register/RegisterForm.tsx", // 注册：register / register-status；未来迁 lib/account-api
]);

/** 抓取的文件后缀 */
const EXTS = new Set([".ts", ".tsx", ".js", ".mjs"]);

/** 匹配的 fetch 形式 */
const PATTERNS = [
  /fetch\(\s*['"`]\/api\//,
  /fetch\(\s*\$\{[^}]+\}\/api\//, // 模板字符串罕见但防漏
];

function* walk(p) {
  const st = statSync(p);
  if (st.isDirectory()) {
    for (const child of readdirSync(p)) {
      yield* walk(join(p, child));
    }
  } else {
    yield p;
  }
}

const violations = [];

for (const dir of SEARCH_DIRS) {
  const abs = join(ROOT, dir);
  try {
    statSync(abs);
  } catch {
    continue; // 文件或目录不存在时跳过
  }
  for (const file of walk(abs)) {
    if (file === abs) continue; // 起点本身
    const rel = relative(ROOT, file);
    if (rel.startsWith(ALLOW_FILE)) continue;
    if (ALLOWLIST.has(rel)) continue;

    const dot = file.lastIndexOf(".");
    if (dot === -1 || !EXTS.has(file.slice(dot))) continue;

    const content = readFileSync(file, "utf8");
    const lines = content.split(/\r?\n/);
    lines.forEach((line, i) => {
      // 跳过注释行（粗略：行首空白 + // 或 *）
      const trimmed = line.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) {
        return;
      }
      if (PATTERNS.some((re) => re.test(line))) {
        violations.push({ file: rel, line: i + 1, text: line.trim() });
      }
    });
  }
}

if (violations.length) {
  console.error(`lint-api-paths: ${violations.length} 处违规（应在 lib/admin-api/ 集中）\n`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}`);
    console.error(`    ${v.text}`);
  }
  console.error(`\n如确认要在这个文件写 /api/*，加到 lib/admin-api/<domain>.ts 并由这里调用，或移动该文件到 ${ALLOW_DIR}/`);
  process.exit(1);
}

console.log("lint-api-paths: 干净（业务代码无裸 fetch(/api/...）调用）");
