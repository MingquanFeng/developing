import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  ALLOWED_TYPES,
  MAX_FILES_PER_BATCH,
  MAX_FILE_BYTES,
  PHOTO_PREFIX,
  TRASH_PREFIX,
  config,
} from "./config";
import {
  deleteObject,
  isPhotoKey,
  isTrashKey,
  makePhotoKey,
  moveToTrash,
  ping,
  presignPut,
  restoreFromTrash,
} from "./cos";
import {
  ensureDefaultAlbum,
  publicManifest,
  readManifest,
  writeManifest,
  type Photo,
} from "./album";
import {
  checkCredentials,
  clearFailures,
  clearSessionCookie,
  currentUser,
  isLocked,
  issueSession,
  noteFailure,
  readCookie,
  requireAuth,
  sessionCookieName,
  setSessionCookie,
  verifySession,
} from "./auth";
import {
  assertSessionSecret,
  countUsers,
  createUser,
  deleteUser,
  findById,
  listUsers,
  toPublic,
  touchLogin,
  updateUser,
  validPassword,
  validUsername,
} from "./users";

const app = new Hono();

/* ---------- 跨域：浏览器直传要打签名接口 ---------- */

app.use(
  "/api/*",
  cors({
    origin: (origin) => (config.allowedOrigins.includes(origin) ? origin : null),
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type"],
    credentials: true,
    maxAge: 600,
  }),
);

/* ---------- 健康检查 ---------- */

app.get("/healthz", async (c) =>
  c.json({
    ok: true,
    bucket: config.bucket,
    region: config.region,
    userCount: countUsers(),
    sessionSecretConfigured: config.sessionSecret.length >= 16,
    cosReachable: await ping(),
  }),
);

/* ---------- 登录 ---------- */

app.post("/api/login", async (c) => {
  const ip =
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    c.req.header("x-real-ip") ||
    "local";

  const body = (await c.req.json().catch(() => ({}))) as {
    username?: string;
    password?: string;
  };
  const username = (body.username ?? "").trim();

  if (!username) return c.json({ error: "username_required" }, 400);
  if (isLocked(ip, username)) {
    return c.json({ error: "locked", retryAfter: 900 }, 429);
  }
  if (countUsers() === 0) {
    return c.json({ error: "no_users", hint: "请先在服务器上执行 npm run user -- add <用户名>" }, 503);
  }

  const user = await checkCredentials(username, body.password ?? "");
  if (!user) {
    noteFailure(ip, username);
    return c.json({ error: "invalid_credentials" }, 401);
  }

  clearFailures(ip, username);
  touchLogin(user.id);
  return c.json(
    { ok: true, user: toPublic(user) },
    { headers: { "Set-Cookie": setSessionCookie(issueSession(user.id)) } },
  );
});

app.post("/api/logout", (c) =>
  c.json({ ok: true }, { headers: { "Set-Cookie": clearSessionCookie() } }),
);

/** 前端探会话用：200=已登录（回用户名），401=没有 */
app.get("/api/session", async (c) => {
  const s = verifySession(readCookie(c, sessionCookieName()));
  if (!s) return c.json({ ok: false }, 401);

  const user = findById(s.userId);
  if (!user || user.disabled) return c.json({ ok: false }, 401);

  return c.json({ ok: true, user: toPublic(user) });
});

/* ---------- 用户管理 ---------- */

app.get("/api/users", requireAuth, (c) =>
  c.json({ users: listUsers() }),
);

app.post("/api/users", requireAuth, async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    username?: string;
    password?: string;
    displayName?: string;
  };
  const username = (body.username ?? "").trim();

  const bad = validUsername(username) ?? validPassword(body.password ?? "");
  if (bad) return c.json({ error: "invalid_input", detail: bad }, 400);

  try {
    const user = await createUser({
      username,
      password: body.password!,
      displayName: body.displayName,
    });
    return c.json({ user }, 201);
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "username_taken") {
      return c.json({ error: "username_taken" }, 409);
    }
    if (code === "stale_revision") {
      return c.json({ error: "stale_revision" }, 409);
    }
    throw e;
  }
});

app.patch("/api/users/:id", requireAuth, async (c) => {
  const id = c.req.param("id") ?? "";
  const body = (await c.req.json().catch(() => ({}))) as {
    displayName?: string;
    password?: string;
    disabled?: boolean;
  };

  const patch: { displayName?: string; password?: string; disabled?: boolean } = {};

  if (body.displayName !== undefined) patch.displayName = body.displayName.trim();
  if (body.password) {
    const bad = validPassword(body.password);
    if (bad) return c.json({ error: "invalid_input", detail: bad }, 400);
    patch.password = body.password;
  }
  if (body.disabled !== undefined) patch.disabled = !!body.disabled;

  if (Object.keys(patch).length === 0) {
    return c.json({ error: "nothing_to_update" }, 400);
  }

  try {
    return c.json({ user: await updateUser(id, patch) });
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "not_found") return c.json({ error: "not_found" }, 404);
    if (code === "stale_revision") return c.json({ error: "stale_revision" }, 409);
    throw e;
  }
});

app.delete("/api/users/:id", requireAuth, async (c) => {
  const id = c.req.param("id") ?? "";
  const me = currentUser(c);
  if (me?.id === id) {
    return c.json({ error: "cannot_delete_self" }, 400);
  }
  try {
    deleteUser(id);
    return c.json({ ok: true });
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "not_found") return c.json({ error: "not_found" }, 404);
    if (code === "last_user") {
      return c.json({ error: "last_user", detail: "至少要保留一个用户，否则谁都进不来" }, 400);
    }
    throw e;
  }
});

/* ---------- 相册清单 ---------- */

app.get("/api/album", async (c) => {
  const manifest = await readManifest();
  c.header("Cache-Control", "no-cache");
  return c.json(publicManifest(manifest));
});

app.put("/api/album", requireAuth, async (c) => {
  const body = (await c.req.json().catch(() => null)) as {
    revision?: number;
    albums?: unknown;
    photos?: unknown;
  } | null;

  if (!body || typeof body.revision !== "number") {
    return c.json({ error: "bad_request" }, 400);
  }

  const result = await writeManifest({
    revision: body.revision,
    albums: (body.albums ?? []) as never,
    photos: (body.photos ?? []) as never,
  });

  if (!result.ok) {
    // 乐观锁冲突：回传当前版本，前端提示刷新而不是静默覆盖
    return c.json(
      { error: "stale_revision", currentRevision: result.current.revision },
      409,
    );
  }
  return c.json({
    revision: result.manifest.revision,
    updatedAt: result.manifest.updatedAt,
  });
});

/* ---------- 发放预签名上传 URL ---------- */

app.post("/api/sign", requireAuth, async (c) => {
  const body = (await c.req.json().catch(() => null)) as {
    files?: { name?: string; size?: number; type?: string }[];
  } | null;

  const files = body?.files;
  if (!Array.isArray(files) || files.length === 0) {
    return c.json({ error: "no_files" }, 400);
  }
  if (files.length > MAX_FILES_PER_BATCH) {
    return c.json({ error: "too_many_files", max: MAX_FILES_PER_BATCH }, 400);
  }

  const items = [];
  for (const f of files) {
    if (!f.name || !f.type || !ALLOWED_TYPES.has(f.type)) {
      return c.json(
        { error: "unsupported_type", name: f.name, allowed: [...ALLOWED_TYPES] },
        400,
      );
    }
    if ((f.size ?? 0) > MAX_FILE_BYTES) {
      return c.json({ error: "file_too_large", name: f.name }, 400);
    }

    // key 由服务端生成，前端无从干预
    const key = makePhotoKey(f.name);
    if (!key.startsWith(PHOTO_PREFIX)) {
      return c.json({ error: "bad_key" }, 500);
    }
    const url = await presignPut(key);
    items.push({ key, url, expiresAt: Date.now() + config.signExpires * 1000 });
  }

  // 首次上传前自动建一个默认相册，省得前端处理空态
  await ensureDefaultAlbum();

  return c.json({
    uploadId: `up_${Date.now().toString(36)}`,
    items,
  });
});

/* ---------- 软删除 ---------- */

app.delete("/api/photo/:id", requireAuth, async (c) => {
  const id = c.req.param("id");
  const manifest = await readManifest();
  const photo = manifest.photos.find((p) => p.id === id);
  if (!photo) return c.json({ error: "not_found" }, 404);

  const trashedAt = new Date().toISOString();
  let trashKey: string | null = null;
  try {
    trashKey = await moveToTrash(photo.key);
  } catch (err) {
    // COS 出错就整个失败，不要出现「元数据说删了但对象还在」的错位
    return c.json({ error: "cos_error", detail: String(err) }, 502);
  }

  const next = manifest.photos.map((p) =>
    p.id === id ? { ...p, trashedAt } : p,
  );
  const written = await writeManifest({
    revision: manifest.revision,
    albums: manifest.albums,
    photos: next as Photo[],
  });
  if (!written.ok) {
    return c.json({ error: "stale_revision" }, 409);
  }

  return c.json({
    ok: true,
    revision: written.manifest.revision,
    trashKey: trashKey ?? null,
  });
});

/* ---------- 恢复（回收站） ---------- */

app.post("/api/photo/:id/restore", requireAuth, async (c) => {
  const id = c.req.param("id");
  const manifest = await readManifest();
  const photo = manifest.photos.find((p) => p.id === id);
  if (!photo) return c.json({ error: "not_found" }, 404);
  if (!photo.trashedAt) return c.json({ error: "not_trashed" }, 400);

  // 恢复后的对象键由 restoreFromTrash 决定，这里同步算一遍好写回元数据
  const restoredKey = `${PHOTO_PREFIX}${photo.key.slice(PHOTO_PREFIX.length)}`;
  try {
    await restoreFromTrash(
      `${TRASH_PREFIX}${photo.key.slice(PHOTO_PREFIX.length)}`,
    );
  } catch (err) {
    return c.json({ error: "cos_error", detail: String(err) }, 502);
  }

  const next = manifest.photos.map((p) =>
    p.id === id ? { ...p, key: restoredKey, trashedAt: null } : p,
  );
  const written = await writeManifest({
    revision: manifest.revision,
    albums: manifest.albums,
    photos: next as Photo[],
  });
  if (!written.ok) return c.json({ error: "stale_revision" }, 409);

  return c.json({ ok: true, revision: written.manifest.revision });
});

/* ---------- 彻底删除 ---------- */

app.delete("/api/photo/:id/purge", requireAuth, async (c) => {
  const id = c.req.param("id");
  const manifest = await readManifest();
  const photo = manifest.photos.find((p) => p.id === id);
  if (!photo) return c.json({ error: "not_found" }, 404);

  const target = photo.trashedAt
    ? `${TRASH_PREFIX}${photo.key.slice(PHOTO_PREFIX.length)}`
    : photo.key;
  // 只允许删 image/ 或 _trash/ 下的对象，别让接口被拿来删 _data/
  if (!isPhotoKey(target) && !isTrashKey(target)) {
    return c.json({ error: "refuse" }, 400);
  }

  await deleteObject(target);
  const written = await writeManifest({
    revision: manifest.revision,
    albums: manifest.albums,
    photos: manifest.photos.filter((p) => p.id !== id) as Photo[],
  });
  if (!written.ok) return c.json({ error: "stale_revision" }, 409);

  return c.json({ ok: true, revision: written.manifest.revision });
});

/* ---------- 兜底 ---------- */

app.onError((err, c) => {
  console.error("[signer]", err);
  return c.json({ error: "internal", detail: String(err) }, 500);
});

serve({ fetch: app.fetch, port: config.port }, async (info) => {
  console.log(`签名服务已启动  http://localhost:${info.port}`);
  console.log(`  桶     ${config.bucket} @ ${config.region}`);
  console.log(`  允许来源 ${config.allowedOrigins.join(", ")}`);

  try {
    assertSessionSecret();
  } catch (e) {
    console.error(`  💥 ${(e as Error).message}`);
    process.exit(1);
  }

  const n = countUsers();
  if (n === 0) {
    console.warn("  ⚠️ 还没有任何用户，登录会返回 503");
    console.warn("     请执行： npm run user -- add <用户名>");
  } else {
    console.log(`  用户   ${n} 个`);
  }
});