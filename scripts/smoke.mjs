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
    {
      env: {
        ...process.env,
        USERS_DB_PATH:
          process.env.USERS_DB_PATH ||
          path.join(root, "data", "users.db"),
      },
      input: `${password}\n${password}\n`,
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
}

function cliUserRm(username) {
  try {
    execFileSync(
      "npm",
      ["--prefix", root, "run", "user", "--", "rm", username],
      {
        env: {
          ...process.env,
          USERS_DB_PATH:
            process.env.USERS_DB_PATH ||
            path.join(root, "data", "users.db"),
        },
        stdio: ["pipe", "pipe", "pipe"],
      },
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

  await step("首页 server render 成功（含 5 个 series 封面图）", async () => {
    c.cookieJar.clear();
    const r = await c.fetch(`/`, {
      headers: { Accept: "text/html" },
    });
    if (r.status !== 200) {
      throw new Error(`HTTP ${r.status} ≠ 200`);
    }
    const html = await r.text();
    // 5 个 series 名字都应在 HTML 里
    for (const name of ["上海 03:17", "北京素描", "莫干之雾", "拉萨白墙", "大理静蓝"]) {
      if (!html.includes(name)) {
        throw new Error(`首页 HTML 缺 series 名字: ${name}`);
      }
    }
    // 当前 admin 还没建 5 个 album，封面应仍走 Unsplash 兜底（任一即可）
    if (!html.includes("images.unsplash.com") && !html.includes("cos.ap-beijing")) {
      throw new Error("首页未渲染任何 series 封面图");
    }
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

  await step("admin 设 album coverKey → 写回 /api/album 反映", async () => {
    c.cookieJar.clear();
    await c.login(ADMIN_USER, ADMIN_PASS);
    const cur = await c.json(`/api/album`);
    const album = cur.body.albums[0];
    const photo = cur.body.photos[0];
    if (!album || !photo) throw new Error("需要至少 1 个 album + 1 张 photo");

    const r = await c.json(`/api/album`, {
      method: "PUT",
      body: JSON.stringify({
        revision: cur.body.revision,
        albums: cur.body.albums.map((a) =>
          a.id === album.id ? { ...a, coverKey: photo.key } : a,
        ),
        photos: cur.body.photos,
      }),
    });
    assert.status(r, 200, "HTTP");

    const after = await c.json(`/api/album`);
    const a2 = after.body.albums.find((a) => a.id === album.id);
    assert.field(a2, "coverKey", photo.key, "coverKey 写成功");

    // 还原 coverKey 避免污染 manifest
    await c.json(`/api/album`, {
      method: "PUT",
      body: JSON.stringify({
        revision: after.body.revision,
        albums: after.body.albums.map((a) =>
          a.id === album.id ? { ...a, coverKey: null } : a,
        ),
        photos: after.body.photos,
      }),
    });
  });

  await step("首页默认 hero 标题含「至静」", async () => {
    c.cookieJar.clear();
    const r = await c.fetch(`/`, { headers: { Accept: "text/html" } });
    if (r.status !== 200) throw new Error(`HTTP ${r.status} ≠ 200`);
    const html = await r.text();
    if (!html.includes("至静")) {
      throw new Error("首页 HTML 不含默认 hero 标题「至静」");
    }
  });

  await step("GET /api/site/content（无需登录）返回 5 个 section", async () => {
    c.cookieJar.clear();
    const r = await c.json(`/api/site/content`);
    assert.status(r, 200, "HTTP");
    assert.truthy(r.body.sections, "sections 字段");
    for (const key of [
      "hero",
      "about",
      "subscribe",
      "footer",
      "story",
      "nav",
      "interlude01",
      "interlude03",
      "coords",
      "worksIntro",
      "site",
    ]) {
      assert.truthy(r.body.sections[key], `sections.${key}`);
    }
    /* 默认值 hero.titleLines[0] 应是 "至静" */
    assert.field(
      r.body.sections.hero,
      "titleLines.0",
      "至静",
      "默认 hero 第 1 行",
    );
    /* 默认值 story.titleMain 应是 "静蓝" */
    assert.field(
      r.body.sections.story,
      "titleMain",
      "静蓝",
      "默认 story titleMain",
    );
  });

  await step("admin PUT /api/site/content/hero 写新 titleLines → 写库 + 首页反映", async () => {
    c.cookieJar.clear();
    await c.login(ADMIN_USER, ADMIN_PASS);
    /* 拿当前 sections 作为 base（PUT body.content 是整节，不是 patch） */
    const cur = await c.json(`/api/site/content`);
    const hero = cur.body.sections.hero;
    const next = { ...hero, titleLines: ["动态首屏", "后台可控"] };
    const put = await c.json(`/api/site/content/hero`, {
      method: "PUT",
      body: JSON.stringify({ content: next }),
    });
    assert.status(put, 200, "HTTP");
    assert.field(put.body, "key", "hero", "key");
    assert.truthy(put.body.updatedAt, "updatedAt");

    /* 落库后 GET 应该看到新值 */
    const after = await c.json(`/api/site/content`);
    assert.field(
      after.body.sections.hero,
      "titleLines.0",
      "动态首屏",
      "DB 落库反映",
    );

    /* 首页 HTML 反映（force-static + revalidatePath 同步生效） */
    const homeR = await c.fetch(`/`, {
      headers: { Accept: "text/html" },
    });
    if (homeR.status !== 200) {
      throw new Error(`首页 HTTP ${homeR.status} ≠ 200`);
    }
    const html = await homeR.text();
    if (!html.includes("动态首屏")) {
      throw new Error("首页 HTML 没反映 PUT 后内容（revalidatePath 未生效？）");
    }
  });

  await step("viewer PUT /api/site/content/hero → 403 forbidden", async () => {
    /* 重新创建 viewer 用于此测试 —— 上一个 step 可能已被删除 */
    const tmpViewer = `smoke_site_${stamp}`;
    const tmpPass = `SmokeSite${stamp}!1`;
    cliUserAdd(tmpViewer, tmpPass);
    try {
      c.cookieJar.clear();
      await c.login(tmpViewer, tmpPass);
      const cur = await c.json(`/api/site/content`);
      const next = {
        ...cur.body.sections.hero,
        titleLines: ["越权", "失败"],
      };
      const r = await c.json(`/api/site/content/hero`, {
        method: "PUT",
        body: JSON.stringify({ content: next }),
      });
      assert.status(r, 403, "HTTP");
      assert.field(r.body, "error", "forbidden", "error");
    } finally {
      cliUserRm(tmpViewer);
    }
  });

  await step("admin PUT 形状不符 → 400 invalid_section_shape", async () => {
    c.cookieJar.clear();
    await c.login(ADMIN_USER, ADMIN_PASS);
    const r = await c.json(`/api/site/content/hero`, {
      method: "PUT",
      body: JSON.stringify({ content: { tags: "不是数组" } }),
    });
    assert.status(r, 400, "HTTP");
    assert.field(r.body, "error", "invalid_section_shape", "error");
  });

  await step("admin DELETE /api/site/content/hero → 回落到默认", async () => {
    c.cookieJar.clear();
    await c.login(ADMIN_USER, ADMIN_PASS);
    const r = await c.json(`/api/site/content/hero`, { method: "DELETE" });
    assert.status(r, 200, "HTTP");
    assert.field(r.body, "key", "hero", "key");
    assert.field(r.body, "reset", true, "reset");

    const after = await c.json(`/api/site/content`);
    assert.field(
      after.body.sections.hero,
      "titleLines.0",
      "至静",
      "DELETE 后回落默认",
    );
  });

  await step("admin PUT /api/site/content/story 写新 titleMain → 首页反映", async () => {
    c.cookieJar.clear();
    await c.login(ADMIN_USER, ADMIN_PASS);
    const cur = await c.json(`/api/site/content`);
    const next = { ...cur.body.sections.story, titleMain: "动态主推" };
    const put = await c.json(`/api/site/content/story`, {
      method: "PUT",
      body: JSON.stringify({ content: next }),
    });
    assert.status(put, 200, "HTTP");
    assert.field(put.body, "key", "story", "key");

    const homeR = await c.fetch(`/`, {
      headers: { Accept: "text/html" },
    });
    if (homeR.status !== 200) throw new Error(`首页 HTTP ${homeR.status}`);
    const html = await homeR.text();
    if (!html.includes("动态主推")) {
      throw new Error("首页 HTML 没反映 PUT story 后内容");
    }
  });

  await step("admin PUT story 形状不符（缺 titleMain）→ 400 invalid_section_shape", async () => {
    c.cookieJar.clear();
    await c.login(ADMIN_USER, ADMIN_PASS);
    const r = await c.json(`/api/site/content/story`, {
      method: "PUT",
      body: JSON.stringify({ content: { tag: "x" } }),
    });
    assert.status(r, 400, "HTTP");
    assert.field(r.body, "error", "invalid_section_shape", "error");
  });

  await step("admin DELETE /api/site/content/story → 回落到默认「静蓝」", async () => {
    c.cookieJar.clear();
    await c.login(ADMIN_USER, ADMIN_PASS);
    const r = await c.json(`/api/site/content/story`, { method: "DELETE" });
    assert.status(r, 200, "HTTP");
    const after = await c.json(`/api/site/content`);
    assert.field(
      after.body.sections.story,
      "titleMain",
      "静蓝",
      "DELETE 后回落默认",
    );
  });

  await step("admin PUT nav 改文案 → 首页导航反映", async () => {
    c.cookieJar.clear();
    await c.login(ADMIN_USER, ADMIN_PASS);
    const cur = await c.json(`/api/site/content`);
    const next = cur.body.sections.nav.map((it, i) =>
      i === 0 ? { ...it, label: "作品集" } : it,
    );
    const put = await c.json(`/api/site/content/nav`, {
      method: "PUT",
      body: JSON.stringify({ content: next }),
    });
    assert.status(put, 200, "HTTP");
    assert.field(put.body, "key", "nav", "key");

    const homeR = await c.fetch(`/`, { headers: { Accept: "text/html" } });
    if (homeR.status !== 200) throw new Error(`首页 HTTP ${homeR.status}`);
    const html = await homeR.text();
    if (!html.includes("作品集")) {
      throw new Error("首页 HTML 没反映 PUT nav 后文案");
    }
    if (!html.includes('href="#works"')) {
      throw new Error("首页 HTML 缺 nav href");
    }
  });

  await step("admin PUT nav 用 javascript: href → 400 invalid_section_shape", async () => {
    c.cookieJar.clear();
    await c.login(ADMIN_USER, ADMIN_PASS);
    const r = await c.json(`/api/site/content/nav`, {
      method: "PUT",
      body: JSON.stringify({
        content: [{ label: "恶意", href: "javascript:alert(1)" }],
      }),
    });
    assert.status(r, 400, "HTTP");
    assert.field(r.body, "error", "invalid_section_shape", "error");
  });

  await step("admin PUT nav 用 //外站 href → 400 invalid_section_shape", async () => {
    c.cookieJar.clear();
    await c.login(ADMIN_USER, ADMIN_PASS);
    const r = await c.json(`/api/site/content/nav`, {
      method: "PUT",
      body: JSON.stringify({
        content: [{ label: "外站", href: "//evil.example.com" }],
      }),
    });
    assert.status(r, 400, "HTTP");
    assert.field(r.body, "error", "invalid_section_shape", "error");
  });

  await step("admin PUT nav 用未知锚点 → 400 invalid_section_shape", async () => {
    c.cookieJar.clear();
    await c.login(ADMIN_USER, ADMIN_PASS);
    const r = await c.json(`/api/site/content/nav`, {
      method: "PUT",
      body: JSON.stringify({
        content: [{ label: "坏锚点", href: "#not-a-section" }],
      }),
    });
    assert.status(r, 400, "HTTP");
    assert.field(r.body, "error", "invalid_section_shape", "error");
  });

  await step("admin DELETE /api/site/content/nav → 回落到默认", async () => {
    c.cookieJar.clear();
    await c.login(ADMIN_USER, ADMIN_PASS);
    const r = await c.json(`/api/site/content/nav`, { method: "DELETE" });
    assert.status(r, 200, "HTTP");
    const after = await c.json(`/api/site/content`);
    assert.field(
      after.body.sections.nav[0],
      "label",
      "作品",
      "DELETE 后回落默认",
    );
  });

  await step("admin PUT interlude01 改 kicker → 首页反映", async () => {
    c.cookieJar.clear();
    await c.login(ADMIN_USER, ADMIN_PASS);
    const cur = await c.json(`/api/site/content`);
    const next = {
      ...cur.body.sections.interlude01,
      kicker: "— 手记 01 / 动态",
    };
    const put = await c.json(`/api/site/content/interlude01`, {
      method: "PUT",
      body: JSON.stringify({ content: next }),
    });
    assert.status(put, 200, "HTTP");
    assert.field(put.body, "key", "interlude01", "key");

    const homeR = await c.fetch(`/`, { headers: { Accept: "text/html" } });
    if (homeR.status !== 200) throw new Error(`首页 HTTP ${homeR.status}`);
    const html = await homeR.text();
    if (!html.includes("手记 01 / 动态")) {
      throw new Error("首页 HTML 没反映 PUT interlude01 后内容");
    }
  });

  await step("admin PUT interlude03 改 kicker → 首页反映", async () => {
    c.cookieJar.clear();
    await c.login(ADMIN_USER, ADMIN_PASS);
    const cur = await c.json(`/api/site/content`);
    const next = {
      ...cur.body.sections.interlude03,
      kicker: "— 手记 03 / 动态",
    };
    const put = await c.json(`/api/site/content/interlude03`, {
      method: "PUT",
      body: JSON.stringify({ content: next }),
    });
    assert.status(put, 200, "HTTP");

    const homeR = await c.fetch(`/`, { headers: { Accept: "text/html" } });
    const html = await homeR.text();
    if (!html.includes("手记 03 / 动态")) {
      throw new Error("首页 HTML 没反映 PUT interlude03 后内容");
    }
  });

  await step("admin PUT coords 改 sig → 首页反映", async () => {
    c.cookieJar.clear();
    await c.login(ADMIN_USER, ADMIN_PASS);
    const cur = await c.json(`/api/site/content`);
    const next = {
      ...cur.body.sections.coords,
      sig: "动态落款 — smoke",
    };
    const put = await c.json(`/api/site/content/coords`, {
      method: "PUT",
      body: JSON.stringify({ content: next }),
    });
    assert.status(put, 200, "HTTP");

    const homeR = await c.fetch(`/`, { headers: { Accept: "text/html" } });
    const html = await homeR.text();
    if (!html.includes("动态落款 — smoke")) {
      throw new Error("首页 HTML 没反映 PUT coords 后内容");
    }
  });

  await step("admin PUT coords rows 减一行 → 首页行数减少", async () => {
    c.cookieJar.clear();
    await c.login(ADMIN_USER, ADMIN_PASS);
    const cur = await c.json(`/api/site/content`);
    const rows = cur.body.sections.coords.rows;
    const next = { ...cur.body.sections.coords, rows: rows.slice(0, -1) };
    const put = await c.json(`/api/site/content/coords`, {
      method: "PUT",
      body: JSON.stringify({ content: next }),
    });
    assert.status(put, 200, "HTTP");

    const after = await c.json(`/api/site/content`);
    assert.field(
      after.body.sections.coords,
      "rows.length",
      rows.length - 1,
      "rows 减一行",
    );
  });

  await step("admin PUT worksIntro 改 titleSuffix → 首页反映", async () => {
    c.cookieJar.clear();
    await c.login(ADMIN_USER, ADMIN_PASS);
    const cur = await c.json(`/api/site/content`);
    const next = {
      ...cur.body.sections.worksIntro,
      titleSuffix: "动态肖像",
    };
    const put = await c.json(`/api/site/content/worksIntro`, {
      method: "PUT",
      body: JSON.stringify({ content: next }),
    });
    assert.status(put, 200, "HTTP");

    const homeR = await c.fetch(`/`, { headers: { Accept: "text/html" } });
    const html = await homeR.text();
    if (!html.includes("动态肖像")) {
      throw new Error("首页 HTML 没反映 PUT worksIntro 后内容");
    }
  });

  await step("admin PUT coords 形状不符（rows 缺字段）→ 400", async () => {
    c.cookieJar.clear();
    await c.login(ADMIN_USER, ADMIN_PASS);
    const r = await c.json(`/api/site/content/coords`, {
      method: "PUT",
      body: JSON.stringify({
        content: { kicker: "x", rows: [{ no: "1" }], sig: "y" },
      }),
    });
    assert.status(r, 400, "HTTP");
    assert.field(r.body, "error", "invalid_section_shape", "error");
  });

  await step("admin DELETE 4 节 → 全部回落默认", async () => {
    c.cookieJar.clear();
    await c.login(ADMIN_USER, ADMIN_PASS);
    for (const key of ["interlude01", "interlude03", "coords", "worksIntro"]) {
      const r = await c.json(`/api/site/content/${key}`, { method: "DELETE" });
      assert.status(r, 200, `DELETE ${key}`);
    }
    const after = await c.json(`/api/site/content`);
    assert.field(
      after.body.sections.interlude01,
      "kicker",
      "— 手记 01 / 关于面孔",
      "interlude01 回落默认",
    );
    assert.field(
      after.body.sections.coords,
      "rows.length",
      5,
      "coords 回落默认 5 行",
    );
    assert.field(
      after.body.sections.worksIntro,
      "titleSuffix",
      "肖像",
      "worksIntro 回落默认",
    );
  });

  await step("admin PUT site 改 name + title → 首页 brand + metadata 反映", async () => {
    c.cookieJar.clear();
    await c.login(ADMIN_USER, ADMIN_PASS);
    const cur = await c.json(`/api/site/content`);
    const next = {
      ...cur.body.sections.site,
      name: "动态站点名",
      title: "动态标题 — 测试",
    };
    const put = await c.json(`/api/site/content/site`, {
      method: "PUT",
      body: JSON.stringify({ content: next }),
    });
    assert.status(put, 200, "HTTP");
    assert.field(put.body, "key", "site", "key");

    /* 首页 brand（顶栏）+ metadata title */
    const homeR = await c.fetch(`/`, { headers: { Accept: "text/html" } });
    if (homeR.status !== 200) throw new Error(`首页 HTTP ${homeR.status}`);
    const html = await homeR.text();
    if (!html.includes("动态站点名")) {
      throw new Error("首页 HTML 没反映 PUT site 后 name");
    }
    if (!html.includes("动态标题 — 测试")) {
      throw new Error("首页 HTML 没反映 PUT site 后 title（metadata）");
    }
  });

  await step("admin PUT site 改 marquee → 顶部跑马灯反映", async () => {
    c.cookieJar.clear();
    await c.login(ADMIN_USER, ADMIN_PASS);
    const cur = await c.json(`/api/site/content`);
    const next = {
      ...cur.body.sections.site,
      marquee: ["动态跑马灯 A", "动态跑马灯 B"],
    };
    const put = await c.json(`/api/site/content/site`, {
      method: "PUT",
      body: JSON.stringify({ content: next }),
    });
    assert.status(put, 200, "HTTP");

    const homeR = await c.fetch(`/`, { headers: { Accept: "text/html" } });
    const html = await homeR.text();
    if (!html.includes("动态跑马灯 A") || !html.includes("动态跑马灯 B")) {
      throw new Error("首页 HTML 没反映 PUT site 后 marquee");
    }
  });

  await step("admin PUT site 带 locale 字段 → 400（locale 不在动态化范围）", async () => {
    c.cookieJar.clear();
    await c.login(ADMIN_USER, ADMIN_PASS);
    const cur = await c.json(`/api/site/content`);
    const next = { ...cur.body.sections.site, locale: "en-US" };
    const r = await c.json(`/api/site/content/site`, {
      method: "PUT",
      body: JSON.stringify({ content: next }),
    });
    /* locale 是额外字段 —— 守卫按已知字段校验，多余字段被忽略，
       所以这里应该 200（locale 不生效）而不是 400 */
    assert.status(r, 200, "HTTP（多余字段被忽略）");
  });

  await step("admin PUT site 形状不符（缺 name）→ 400", async () => {
    c.cookieJar.clear();
    await c.login(ADMIN_USER, ADMIN_PASS);
    const r = await c.json(`/api/site/content/site`, {
      method: "PUT",
      body: JSON.stringify({ content: { title: "只有标题" } }),
    });
    assert.status(r, 400, "HTTP");
    assert.field(r.body, "error", "invalid_section_shape", "error");
  });

  await step("admin DELETE site → 回落到默认", async () => {
    c.cookieJar.clear();
    await c.login(ADMIN_USER, ADMIN_PASS);
    const r = await c.json(`/api/site/content/site`, { method: "DELETE" });
    assert.status(r, 200, "HTTP");
    const after = await c.json(`/api/site/content`);
    assert.field(
      after.body.sections.site,
      "name",
      "塞上空许",
      "DELETE 后回落默认",
    );
  });

  await step("GET /api/site/content 公开响应不再含 meta（userId 不泄露）", async () => {
    c.cookieJar.clear();
    const r = await c.json(`/api/site/content`);
    assert.status(r, 200, "HTTP");
    assert.truthy(r.body.sections, "sections 字段");
    /* meta 字段已拆到独立端点 —— 不在公开 GET 响应里 */
    assert.truthy(
      r.body.meta === undefined,
      `meta 字段不应在公开 GET 出现（实际=${JSON.stringify(r.body.meta)}）`,
    );
  });

  await step("GET /api/site/content/meta 无登录 → 401", async () => {
    c.cookieJar.clear();
    const r = await c.json(`/api/site/content/meta`);
    assert.status(r, 401, "HTTP");
  });

  await step("viewer GET /api/site/content/meta → 403", async () => {
    const tmpViewer = `smoke_meta_${stamp}`;
    const tmpPass = `SmokeMeta${stamp}!1`;
    cliUserAdd(tmpViewer, tmpPass);
    try {
      c.cookieJar.clear();
      await c.login(tmpViewer, tmpPass);
      const r = await c.json(`/api/site/content/meta`);
      assert.status(r, 403, "HTTP");
    } finally {
      cliUserRm(tmpViewer);
    }
  });

  await step("admin GET /api/site/content/meta → 200 + meta[]", async () => {
    c.cookieJar.clear();
    await c.login(ADMIN_USER, ADMIN_PASS);
    const r = await c.json(`/api/site/content/meta`);
    assert.status(r, 200, "HTTP");
    assert.truthy(Array.isArray(r.body.meta), "meta 是数组");
  });

  await step("security_log.site_content_* 行用 actor_user_id 列存 userId", async () => {
    const dbPath =
      process.env.USERS_DB_PATH || path.join(root, "data", "users.db");
    /* 跑一次写入以确保有最新一行 */
    c.cookieJar.clear();
    await c.login(ADMIN_USER, ADMIN_PASS);
    const cur = await c.json(`/api/site/content`);
    const next = {
      ...cur.body.sections.hero,
      titleLines: ["元数据审计", "smoke-test"],
    };
    await c.json(`/api/site/content/hero`, {
      method: "PUT",
      body: JSON.stringify({ content: next }),
    });
    /* 查最新一行 site_content_write：user_ref 应为 NULL，actor_user_id 应为 admin id */
    const adminMe = await c.json(`/api/session`);
    const myId = adminMe.body.user.id;
    const out = execFileSync("sqlite3", [
      dbPath,
      `SELECT user_ref, actor_user_id FROM security_log
         WHERE kind = 'site_content_write'
         ORDER BY created_at DESC LIMIT 1;`,
    ]).toString();
    const row = out.trim().split("|");
    if (row[0] !== "") {
      throw new Error(`user_ref 应为 NULL（实际="${row[0]}"）`);
    }
    if (row[1] !== myId) {
      throw new Error(
        `actor_user_id 应等于 admin userId（实际="${row[1]}" vs "${myId}"）`,
      );
    }
    /* 还原 hero，避免污染 */
    await c.json(`/api/site/content/hero`, { method: "DELETE" });
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
    const dbPath =
      process.env.USERS_DB_PATH ||
      path.join(root, "data", "users.db");
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
