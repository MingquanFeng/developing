#!/usr/bin/env node
/**
 * 端到端冒烟 —— 16 项
 *
 * 默认连 `http://localhost:3000`（合并后同源 /api/* 都在 Next.js 进程内）。
 * 起服务：`npm run dev`（或 `npm run start`）。
 *
 * 全部 16 项必须通过；失败任意一项进程退出码 1。
 *
 *   node scripts/smoke.mjs                   默认 3000
 *   node scripts/smoke.mjs --port=3100      其它端口
 *   SMOKE_ADMIN_PASS=pw1234 node ...        自定义 admin 密码
 *
 * 用 Node 18+ 内置 fetch、AbortController、import.meta.url，无第三方依赖。
 */

import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.join(__dirname, "..");

// 解析 --port=
const argv = process.argv.slice(2);
const portArg = argv.find((a) => a.startsWith("--port="));
const port = portArg ? Number(portArg.split("=")[1]) : 3000;
const BASE = process.env.SMOKE_URL || `http://localhost:${port}`;

const ADMIN_USER = process.env.SMOKE_ADMIN_USER || "photog";
const ADMIN_PASS = process.env.SMOKE_ADMIN_PASS || "testpw123456";

/* ---------- 工具 ---------- */

const c = {
  cookieJar: new Map(),
  /** 本次 smoke 用唯一 X-Forwarded-For 头避开手测留下的限流计数。 */
  testIp: `10.99.${Math.floor(Math.random() * 254) + 1}.${Math.floor(Math.random() * 254) + 1}`,
  baseHeaders() {
    return { "X-Forwarded-For": c.testIp, "X-Real-IP": c.testIp };
  },
  fetch(url, opts = {}) {
    const headers = new Headers(opts.headers || {});
    for (const [k, v] of Object.entries(c.baseHeaders())) headers.set(k, v);
    const cookieHeader = [...c.cookieJar.entries()]
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
    if (cookieHeader) headers.set("Cookie", cookieHeader);
    return globalThis.fetch(url.startsWith("/") ? `${BASE}${url}` : url, {
      ...opts,
      headers,
      redirect: "follow",
    });
  },
  feedSetCookie(res) {
    const raw = res.headers.get("set-cookie");
    if (!raw) return;
    for (const part of raw.split(/,(?=[^;]+=)/)) {
      const [pair] = part.split(";");
      const eq = pair.indexOf("=");
      if (eq <= 0) continue;
      c.cookieJar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  },
  async json(url, opts = {}) {
    const headers = new Headers(opts.headers || {});
    if (opts.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    const r = await c.fetch(url, { ...opts, headers });
    c.feedSetCookie(r);
    let body;
    try {
      body = await r.json();
    } catch {
      body = null;
    }
    return { status: r.status, body };
  },
  async login(username, password) {
    return c.json(`/api/login`, {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
  },
  async logout() {
    await c.json(`/api/logout`, { method: "POST" });
    c.cookieJar.clear();
  },
};

const ok = [];
const fail = [];

async function step(name, fn) {
  try {
    await fn();
    ok.push(name);
    console.log(`  ✓ ${name}`);
  } catch (e) {
    fail.push({ name, error: e });
    console.log(`  ✗ ${name}`);
    console.log(`    ${e.message}`);
  }
}

const assert = {
  eq(actual, expected, label) {
    if (actual !== expected) {
      throw new Error(`${label}: 实际 ${JSON.stringify(actual)} ≠ 预期 ${JSON.stringify(expected)}`);
    }
  },
  status(r, expected, label) {
    if (r.status !== expected) {
      throw new Error(
        `${label}: HTTP ${r.status} ≠ ${expected}; body=${JSON.stringify(r.body)}`,
      );
    }
  },
  field(obj, path, expected, label) {
    const parts = path.split(".");
    let cur = obj;
    for (const k of parts) cur = cur?.[k];
    if (cur !== expected) {
      throw new Error(`${label}: ${path} = ${JSON.stringify(cur)} ≠ ${expected}`);
    }
  },
  truthy(value, label) {
    if (!value) throw new Error(`${label}: 期望 truthy，实际 ${JSON.stringify(value)}`);
  },
};

/* ---------- 自检 ---------- */

console.log(`\n冒烟  ${BASE}\n`);

const health = await c.json(`/api/healthz`);
if (health.status !== 200 || health.body?.ok !== true) {
  console.error(
    `服务不在 ${BASE}（或 healthz 不通）。先起：npm run dev`,
  );
  process.exit(1);
}
console.log(`  ✓ 健康检查 ${health.body.userCount} 个用户\n`);

/* ---------- 临时 viewer 跑全套，再清 ---------- */

const stamp = Date.now().toString(36);
const viewer = `smoke_${stamp}`;
const viewerPass = `Smoke${stamp}!1`;

/* 用 Node spawn CLI 走真 SQLite（与生产一致） */
function cliUserAdd(username, password, role = "viewer") {
  execFileSync(
    "npm",
    ["--prefix", root, "run", "user", "--", "add", username, role],
    { input: `${password}\n${password}\n`, stdio: ["pipe", "pipe", "pipe"] },
  );
}

function cliUserRm(username) {
  try {
    execFileSync(
      "npm",
      ["--prefix", root, "run", "user", "--", "rm", username],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
  } catch {
    /* 删失败不致命 */
  }
}

cliUserAdd(viewer, viewerPass);

/* ====== 测试 ====== */

try {
  await step("admin 登录", async () => {
    c.cookieJar.clear();
    const r = await c.login(ADMIN_USER, ADMIN_PASS);
    assert.status(r, 200, "HTTP");
    assert.field(r.body, "user.role", "admin", "role");
  });

  await step("GET /api/session 返回 admin", async () => {
    const r = await c.json(`/api/session`);
    assert.status(r, 200, "HTTP");
    assert.field(r.body, "ok", true, "ok");
    assert.field(r.body, "user.username", ADMIN_USER, "username");
  });

  await step("viewer 登录 + sessionVersion=1", async () => {
    c.cookieJar.clear();
    const r = await c.login(viewer, viewerPass);
    assert.status(r, 200, "HTTP");
    assert.field(r.body, "user.role", "viewer", "role");
    assert.field(r.body, "user.sessionVersion", 1, "sessionVersion");
  });

  await step("登录记录 lastLoginIp（X-Forwarded-For 入库）", async () => {
    c.cookieJar.clear();
    await c.login(viewer, viewerPass);
    const users = await c.json(`/api/users`);
    const v = users.body.users.find((u) => u.username === viewer);
    assert.truthy(v, "viewer 在 /api/users 里");
    assert.truthy(
      v.lastLoginIp === c.testIp,
      `lastLoginIp (${v.lastLoginIp}) 应等于 X-Forwarded-For (${c.testIp})`,
    );
  });

  await step("注册保留名 admin → 409 username_reserved", async () => {
    const r = await c.json(`/api/register`, {
      method: "POST",
      body: JSON.stringify({ username: "admin", password: "Str0ngPw!!" }),
    });
    assert.status(r, 409, "HTTP");
    assert.field(r.body, "error", "username_reserved", "error");
  });

  await step("注册保留名大小写不敏感 (Admin) → 409", async () => {
    const r = await c.json(`/api/register`, {
      method: "POST",
      body: JSON.stringify({ username: "Admin", password: "Str0ngPw!!" }),
    });
    assert.status(r, 409, "HTTP");
    assert.field(r.body, "error", "username_reserved", "error");
  });

  await step("自助改密 旧密码错 → 400", async () => {
    const r = await c.json(`/api/account/password`, {
      method: "POST",
      body: JSON.stringify({ currentPassword: "wrong", newPassword: "NewPw1234" }),
    });
    assert.status(r, 400, "HTTP");
    assert.field(r.body, "error", "wrong_current_password", "error");
  });

  let savedOldCookie;
  await step("自助改密 成功 → 200 + 新 cookie (v=2)", async () => {
    savedOldCookie = [...c.cookieJar.entries()].find(([k]) => k === "album_session")?.[1];
    const r = await c.json(`/api/account/password`, {
      method: "POST",
      body: JSON.stringify({ currentPassword: viewerPass, newPassword: "NewPw1234" }),
    });
    assert.status(r, 200, "HTTP");
    assert.field(r.body, "user.sessionVersion", 2, "sessionVersion 升 2");
    const newCookie = [...c.cookieJar.entries()].find(([k]) => k === "album_session")?.[1];
    if (newCookie === savedOldCookie) throw new Error("cookie 没换");
  });

  await step("旧 cookie 被踢 /api/session → 401", async () => {
    c.cookieJar.set("album_session", savedOldCookie);
    const r = await c.json(`/api/session`);
    assert.status(r, 401, "HTTP");
    c.cookieJar.set("album_session", "");
  });

  await step("新密码登录成功", async () => {
    c.cookieJar.clear();
    const r = await c.login(viewer, "NewPw1234");
    assert.status(r, 200, "HTTP");
  });

  await step("旧密码登录 → 401", async () => {
    c.cookieJar.clear();
    const r = await c.login(viewer, viewerPass);
    assert.status(r, 401, "HTTP");
    assert.field(r.body, "error", "invalid_credentials", "error");
  });

  await step("重新登录 admin", async () => {
    c.cookieJar.clear();
    const r = await c.login(ADMIN_USER, ADMIN_PASS);
    assert.status(r, 200, "HTTP");
  });

  let resetUrl, resetToken;
  await step("admin 生成 reset-link", async () => {
    const users = await c.json(`/api/users`);
    const v = users.body.users.find((u) => u.username === viewer);
    if (!v) throw new Error("viewer 不存在");
    const r = await c.json(`/api/users/${v.id}/reset-link`, {
      method: "POST",
    });
    assert.status(r, 200, "HTTP");
    assert.truthy(r.body.url, "url");
    assert.truthy(r.body.expiresAt, "expiresAt");
    resetUrl = r.body.url;
    resetToken = new URL(resetUrl).searchParams.get("token");
    if (!resetToken) throw new Error("url 里没 token");
  });

  await step("token 重置 → 200", async () => {
    c.cookieJar.clear();
    const r = await c.json(`/api/account/reset`, {
      method: "POST",
      body: JSON.stringify({ token: resetToken, newPassword: "ResetPw1234" }),
    });
    assert.status(r, 200, "HTTP");
  });

  await step("token 第二次用 → 410 token_used", async () => {
    const r = await c.json(`/api/account/reset`, {
      method: "POST",
      body: JSON.stringify({ token: resetToken, newPassword: "ResetPw1234" }),
    });
    assert.status(r, 410, "HTTP");
    assert.field(r.body, "error", "token_used", "error");
  });

  await step("不存在 token → 404 token_not_found", async () => {
    const r = await c.json(`/api/account/reset`, {
      method: "POST",
      body: JSON.stringify({
        token: "deadbeef0000000000000000000000000000000000000000000000000000abcd",
        newPassword: "ResetPw1234",
      }),
    });
    assert.status(r, 404, "HTTP");
    assert.field(r.body, "error", "token_not_found", "error");
  });

  let viewerCookie;
  await step("admin 踢出 viewer → 旧 cookie 401", async () => {
    c.cookieJar.clear();
    await c.login(viewer, "ResetPw1234");
    viewerCookie = c.cookieJar.get("album_session");

    c.cookieJar.clear();
    await c.login(ADMIN_USER, ADMIN_PASS);
    const users = await c.json(`/api/users`);
    const v = users.body.users.find((u) => u.username === viewer);
    const r = await c.json(`/api/users/${v.id}/sessions/revoke`, {
      method: "POST",
    });
    assert.status(r, 200, "HTTP");

    c.cookieJar.set("album_session", viewerCookie);
    const probe = await c.json(`/api/session`);
    assert.status(probe, 401, "viewer session 被踢");
  });

  await step("admin 踢自己 → 400 cannot_revoke_self", async () => {
    c.cookieJar.clear();
    await c.login(ADMIN_USER, ADMIN_PASS);
    const me = await c.json(`/api/session`);
    const myId = me.body.user.id;
    const r = await c.json(`/api/users/${myId}/sessions/revoke`, {
      method: "POST",
    });
    assert.status(r, 400, "HTTP");
    assert.field(r.body, "error", "cannot_revoke_self", "error");
  });

  await step("admin 删 user → 200 + 联动清资源 (photos/albums/objects)", async () => {
    c.cookieJar.clear();
    await c.login(ADMIN_USER, ADMIN_PASS);
    const users = await c.json(`/api/users`);
    const v = users.body.users.find((u) => u.username === viewer);
    if (!v) throw new Error("viewer 不存在");
    const r = await c.json(`/api/users/${v.id}`, { method: "DELETE" });
    assert.status(r, 200, "HTTP");
    assert.field(r.body, "ok", true, "ok");
    assert.truthy(r.body.deleted, "deleted 字段");
    assert.truthy(
      typeof r.body.deleted.photos === "number",
      "photos 计数",
    );
    assert.truthy(
      typeof r.body.deleted.albums === "number",
      "albums 计数",
    );
    assert.truthy(
      typeof r.body.deleted.objectsDeleted === "number",
      "objectsDeleted 计数",
    );

    // 确认 /api/users 拿不到了
    const after = await c.json(`/api/users`);
    assert.truthy(
      !after.body.users.find((u) => u.username === viewer),
      "viewer 已从 /api/users 列表消失",
    );
  });

  await step("删除自己 → 400 cannot_delete_self", async () => {
    c.cookieJar.clear();
    await c.login(ADMIN_USER, ADMIN_PASS);
    const me = await c.json(`/api/session`);
    const myId = me.body.user.id;
    const r = await c.json(`/api/users/${myId}`, { method: "DELETE" });
    assert.status(r, 400, "HTTP");
    assert.field(r.body, "error", "cannot_delete_self", "error");
  });

  await step("security_log 落库（password_reset 与 session_revoked）", async () => {
    const dbPath = path.join(root, "data", "users.db");
    const out = execFileSync("sqlite3", [
      dbPath,
      `SELECT kind, COUNT(*) FROM security_log WHERE kind IN ('password_reset','session_revoked') GROUP BY kind;`,
    ]).toString();
    if (!out.includes("password_reset"))
      throw new Error("password_reset 没落库");
    if (!out.includes("session_revoked"))
      throw new Error("session_revoked 没落库");
  });
} finally {
  cliUserRm(viewer);
  c.cookieJar.clear();
}

console.log(`\n通过 ${ok.length} 项`);
if (fail.length) {
  console.log(`\n失败 ${fail.length} 项:`);
  for (const f of fail) console.log(`  - ${f.name}: ${f.error.message}`);
  process.exit(1);
}
console.log("\n✓ smoke 全过\n");
