"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  EMPTY,
  fetchManifest,
  fetchPhotoUrl,
  generateResetLink,
  revokeUserSessions,
  type Manifest,
  type PublicUser,
  type ResetLinkResponse,
} from "@/lib/album-client";
import type { Album, Photo } from "@/lib/album-types";

import {
  inspectFile,
  newItem,
  runUpload,
  type QueueItem,
} from "./upload-queue";
import styles from "./admin.module.css";

/* ============================================================
   AdminApp —— 后台总控
   登录 → 拖拽上传 → 已传照片管理 → 回收站
   ============================================================ */
export default function AdminApp() {
  const [authed, setAuthed] = useState<boolean | null>(null); // null=探测中
  const [me, setMe] = useState<PublicUser | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginErr, setLoginErr] = useState("");
  const [busy, setBusy] = useState(false);

  const [data, setData] = useState<Manifest>(EMPTY);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<"photos" | "trash" | "users">("photos");
  const [users, setUsers] = useState<PublicUser[]>([]);

  /* 根地址，不带路径。signerEndpoint(x) 是「基址+x」，当根地址用会拼出废 URL */
  /* 根地址：合并后所有 /api/* 同源。`apiBase = ""` 让 `${apiBase}/api/...` 拼出相对路径，
     保留这层壳是怕有人未来要切回独立服务时还能直接用。 */
  const apiBase = "";

  /* ---------- 探测会话 ---------- */
  useEffect(() => {
    fetch(`/api/session`, { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.user) {
          setMe(d.user);
          setAuthed(true);
        } else {
          setAuthed(false);
        }
      })
      .catch(() => setAuthed(false));
  }, []);

  /* ---------- 拉清单 ---------- */
  const reload = useCallback(async () => {
    try {
      setData(await fetchManifest());
    } catch {
      /* 错误由各处自行提示 */
    }
  }, []);

  useEffect(() => {
    if (authed) reload();
  }, [authed, reload]);

  const reloadUsers = useCallback(async () => {
    try {
      const r = await fetch(`/api/users`, { credentials: "include" });
      if (r.ok) setUsers((await r.json()).users);
    } catch {
      /* 忽略，靠页面上的旧数据 */
    }
  }, []);

  useEffect(() => {
    if (authed && tab === "users") reloadUsers();
  }, [authed, tab, reloadUsers]);

  /* ---------- 写清单（带乐观锁重试） ---------- */
  const save = useCallback(
    async (next: Manifest) => {
      for (let attempt = 0; attempt < 3; attempt++) {
        const res = await fetch(`/api/album`, {
          method: "PUT",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            revision: next.revision,
            albums: next.albums,
            photos: next.photos,
          }),
        });
        const at = `（请求地址：/api/login）`;

      if (res.ok) {
          const saved = (await res.json()) as { revision: number; updatedAt: string };
          const merged = { ...next, ...saved };
          setData(merged);
          return merged;
        }
        if (res.status === 409) {
          // 版本冲突：拉最新的再合一次，避免覆盖别人的改动
          const cur = await fetchManifest();
          next = { ...next, revision: cur.revision };
          setData(cur);
          continue;
        }
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `保存失败 HTTP ${res.status}`);
      }
      throw new Error("保存冲突，重试三次仍未成功");
    },
    [], 
  );

  /* ---------- 登录 ---------- */
  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setLoginErr("");
    try {
      const res = await fetch(`/api/login`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const at = `（请求地址：/api/login）`;

      if (res.ok) {
        const d = await res.json().catch(() => null);
        if (d?.user) {
          setMe(d.user);
          // 非 admin 不要停在用户管理标签（那个标签对它不存在）
          if (d.user.role !== "admin" && tab === "users") setTab("photos");
        }
        setPassword("");
        setAuthed(true);
        return;
      }

      /* 逐个状态码说清楚，不要一律报「口令不正确」——
         之前 401/429/503 都落到同一句，排查时完全看不出真实原因 */
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        hint?: string;
        retryAfter?: number;
      };
      switch (res.status) {
        case 401:
          throw new Error(`用户名或密码不正确 ${at}`);
        case 429:
          throw new Error(
            `尝试过多，已锁定，请 ${Math.round((body.retryAfter ?? 900) / 60)} 分钟后再试 ${at}`,
          );
        case 503:
          throw new Error(
            body.hint === "no_users"
              ? "服务端还没有任何用户，请先在服务器执行 npm run user -- add <用户名>"
              : `签名服务不可用 ${at}`,
          );
        default:
          throw new Error(
            `登录失败 HTTP ${res.status}${body.error ? `：${body.error}` : ""} ${at}`,
          );
      }
    } catch (e) {
      const msg = (e as Error).message;
      setLoginErr(
        /Failed to fetch|NetworkError|Load failed/.test(msg)
          ? `连不上后端 —— 请确认 Next.js 进程正常运行，且 /api/* 路由没被改坏`
          : msg,
      );
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    await fetch(`/api/logout`, {
      method: "POST",
      credentials: "include",
    }).catch(() => {});
    setAuthed(false);
    setMe(null);
    setData(EMPTY);
    setSelected(new Set());
  };

  /* ---------- 上传 ---------- */
  const addFiles = useCallback(async (files: File[]) => {
    const accepted: QueueItem[] = [];
    const rejected: string[] = [];

    for (const f of files) {
      const r = await inspectFile(f);
      if (r.ok) accepted.push(newItem(f, r.width, r.height));
      else rejected.push(`${f.name}：${r.reason}`);
    }

    if (rejected.length) {
      setNotice({ kind: "err", text: rejected.join("；") });
    }
    if (!accepted.length) return;

    setQueue((q) => [...q, ...accepted]);
    setNotice(null);

    const snapshot = [...queue, ...accepted];
    await runUpload(snapshot, {
      onChange: setQueue,
      onComplete: async (uploaded) => {
        if (!uploaded.length) {
          setNotice({ kind: "err", text: "没有成功的文件" });
          return;
        }
        try {
          const cur = await fetchManifest();
          // 相册已按用户隔离：只能挑自己名下的，绝不能拿 cur.albums[0]
          // （那可能是别人的相册，照片会被写进去但 ownerId 对不上）
          const myAlbums = cur.albums.filter((a) => a.ownerId === me?.id);
          const albumId = myAlbums[0]?.id ?? "";
          const albums = myAlbums.length
            ? cur.albums
            : [...cur.albums, defaultAlbum(me?.id)];
          const photos: Photo[] = uploaded.map((u, i) => ({
            id: `ph_${Date.now().toString(36)}${i}`,
            key: u.key,
            albumId,
            // 归属由会话决定；默认私有，要公开再去后台切
            ownerId: me?.id ?? "",
            isPublic: false,
            title: u.title,
            caption: "",
            place: "",
            shotAt: new Date().toISOString().slice(0, 10),
            width: u.width,
            height: u.height,
            bytes: u.bytes,
            trashedAt: null,
          }));
          await save({
            ...cur,
            albums,
            photos: [...cur.photos, ...photos],
          });
          setNotice({ kind: "ok", text: `已入库 ${photos.length} 张` });
        } catch (e) {
          setNotice({
            kind: "err",
            text: `文件已传上去但写元数据失败：${(e as Error).message}。刷新后可在列表里手动补录。`,
          });
        }
        setQueue((q) => q.filter((it) => it.status !== "done"));
      },
      onError: (m) => setNotice({ kind: "err", text: m }),
    });
  }, [queue, save]);

  /* ---------- 编辑 ---------- */
  const editPhoto = async (id: string, patch: Partial<Photo>) => {
    // isPublic 走单张接口：开关是高频操作，
    // 走整份清单每次都要拉全量再提交，别人一改就撞乐观锁。
    if (Object.keys(patch).length === 1 && patch.isPublic !== undefined) {
      try {
        const r = await fetch(`/api/photo/${id}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ isPublic: patch.isPublic }),
        });
        if (!r.ok) {
          const b = await r.json().catch(() => ({}));
          throw new Error(b.detail || b.error || "切换失败");
        }
        const b = await r.json();
        setData((d) => ({
          ...d,
          revision: b.revision,
          photos: d.photos.map((p) => (p.id === id ? b.photo : p)),
        }));
      } catch (e) {
        setNotice({ kind: "err", text: (e as Error).message });
      }
      return;
    }

    try {
      await save({
        ...data,
        photos: data.photos.map((p) => (p.id === id ? { ...p, ...patch } : p)),
      });
    } catch (e) {
      setNotice({ kind: "err", text: (e as Error).message });
    }
  };

  const trashPhoto = async (ids: string[]) => {
    setBusy(true);
    try {
      for (const id of ids) {
        const r = await fetch(`/api/photo/${id}`, {
          method: "DELETE",
          credentials: "include",
        });
        if (!r.ok && r.status !== 409) {
          const b = await r.json().catch(() => ({}));
          throw new Error(b.error ?? `删除失败 HTTP ${r.status}`);
        }
      }
      await reload();
      setSelected(new Set());
      setNotice({ kind: "ok", text: `已移入回收站 ${ids.length} 张` });
    } catch (e) {
      setNotice({ kind: "err", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const restore = async (id: string) => {
    try {
      const r = await fetch(`/api/photo/${id}/restore`, {
        method: "POST",
        credentials: "include",
      });
      if (!r.ok) throw new Error(`恢复失败 HTTP ${r.status}`);
      await reload();
      setNotice({ kind: "ok", text: "已恢复" });
    } catch (e) {
      setNotice({ kind: "err", text: (e as Error).message });
    }
  };

  const purge = async (id: string) => {
    try {
      const r = await fetch(`/api/photo/${id}/purge`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!r.ok) throw new Error(`彻底删除失败 HTTP ${r.status}`);
      await reload();
      setNotice({ kind: "ok", text: "已彻底删除" });
    } catch (e) {
      setNotice({ kind: "err", text: (e as Error).message });
    }
  };

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  /* ---------- 渲染 ---------- */

  if (authed === null) {
    return (
      <Frame>
        <Block title="正在检查登录状态">
          <p>—</p>
        </Block>
      </Frame>
    );
  }

  if (!authed) {
    return (
      <Frame>
        <form className={styles.login} onSubmit={login}>
          <h1 className={styles.loginTitle}>相册后台</h1>
          <p className={styles.loginSub}>输入用户名与密码</p>
          <input
            className={styles.input}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="用户名"
            autoFocus
            autoComplete="username"
          />
          <input
            className={styles.input}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="密码"
            autoComplete="current-password"
          />
          {loginErr ? <p className={styles.err}>{loginErr}</p> : null}
          <button className={styles.primary} disabled={busy || !username || !password}>
            {busy ? "验证中…" : "进入"}
          </button>
        </form>
      </Frame>
    );
  }

  const visible = data.photos.filter((p) =>
    tab === "photos" ? !p.trashedAt : !!p.trashedAt,
  );
  const trashedCount = data.photos.filter((p) => p.trashedAt).length;
  const pendingCount = queue.filter((q) => q.status !== "done").length;

  return (
    <Frame>
      <header className={styles.head}>
        <div>
          <h1 className={styles.title}>相册后台</h1>
          <p className={styles.sub}>
            共 {data.photos.length - trashedCount} 张 · 版本{" "}
            {String(data.revision).padStart(2, "0")}
            {me ? ` · ${me.displayName || me.username}` : ""}
          </p>
        </div>
        <button className={styles.ghost} onClick={logout}>
          退出
        </button>
      </header>

      {notice ? (
        <p className={notice.kind === "ok" ? styles.ok : styles.err}>{notice.text}</p>
      ) : null}

      {/* ---------- 上传区 ---------- */}
      <DropZone onFiles={addFiles} busy={busy} pending={pendingCount} />

      {queue.length ? (
        <ul className={styles.queue}>
          {queue.map((it) => (
            <li key={it.uid} className={styles.qItem}>
              <span className={styles.qName} title={it.file.name}>
                {it.file.name}
              </span>
              <span className={styles.qBar}>
                <i style={{ width: `${it.progress}%` }} />
              </span>
              <span className={styles.qState}>
                {it.status === "done"
                  ? "完成"
                  : it.status === "error"
                    ? (it.error ?? "失败")
                    : `${it.progress}%`}
              </span>
              {it.status === "error" ? (
                <button
                  className={styles.mini}
                  onClick={() => addFiles([it.file])}
                >
                  重试
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {/* ---------- 照片管理 ---------- */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tabBtn} ${tab === "photos" ? styles.tabOn : ""}`}
          onClick={() => setTab("photos")}
        >
          照片 {data.photos.length - trashedCount}
        </button>
        <button
          className={`${styles.tabBtn} ${tab === "trash" ? styles.tabOn : ""}`}
          onClick={() => setTab("trash")}
        >
          回收站 {trashedCount}
        </button>
        {/* 用户管理是 admin 专属。viewer 点进去只会拿到 403，
            不如根本不显示这个标签 —— 省得让人以为功能坏了 */}
        {me?.role === "admin" ? (
          <button
            className={`${styles.tabBtn} ${tab === "users" ? styles.tabOn : ""}`}
            onClick={() => setTab("users")}
          >
            用户 {users.length || me ? users.length || 1 : 0}
          </button>
        ) : null}
        {selected.size > 0 && tab === "photos" ? (
          <button
            className={styles.danger}
            disabled={busy}
            onClick={() => trashPhoto([...selected])}
          >
            移入回收站 {selected.size} 张
          </button>
        ) : null}
      </div>

      {tab === "users" ? (
        <UserPanel
          users={users}
          me={me}
          apiBase={apiBase}
          onChanged={reloadUsers}
        />
      ) : visible.length === 0 ? (
        <p className={styles.muted}>
          {tab === "photos" ? "还没有照片，拖文件到上面。" : "回收站是空的。"}
        </p>
      ) : (
        <ul className={styles.list}>
          {visible.map((p) => (
            <PhotoRow
              key={p.id}
              photo={p}
              albums={data.albums}
              checked={selected.has(p.id)}
              onToggle={() => toggle(p.id)}
              onEdit={(patch) => editPhoto(p.id, patch)}
              onRestore={() => restore(p.id)}
              onPurge={() => purge(p.id)}
              inTrash={!!p.trashedAt}
            />
          ))}
        </ul>
      )}
    </Frame>
  );
}

function defaultAlbum(ownerId?: string): Album {
  return {
    // id 里带 owner，后端 PUT /api/album 据此判断「这是你的相册」
    id: `alb_${ownerId ?? "anon"}_${Date.now().toString(36)}`,
    slug: `u-${ownerId ?? "anon"}-misc`,
    name: "未成册",
    desc: "不属于任何一次的随手记录。",
    coverKey: null,
    order: 1,
    ownerId,
  };
}

/* ---------- 外壳 ---------- */
function Frame({ children }: { children: React.ReactNode }) {
  return <div className={styles.shell}>{children}</div>;
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={styles.shell}>
      <h1 className={styles.title}>{title}</h1>
      <div className={styles.muted}>{children}</div>
    </div>
  );
}

/* ---------- 拖拽区 ---------- */
function DropZone({
  onFiles,
  busy,
  pending,
}: {
  onFiles: (f: File[]) => void;
  busy: boolean;
  pending: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  return (
    <div
      className={`${styles.drop} ${over ? styles.dropOver : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const files = Array.from(e.dataTransfer.files).filter((f) =>
          f.type.startsWith("image/"),
        );
        if (files.length) onFiles(files);
      }}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,image/avif"
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) onFiles(files);
          e.target.value = "";
        }}
      />
      <span className={styles.dropTitle}>
        {busy || pending > 0 ? `上传中 ${pending}` : "拖照片到这里，或点击选择"}
      </span>
      <span className={styles.dropHint}>
        JPEG / PNG / WebP / AVIF · 单张 ≤ 50MB · 文件直传 COS，不经过服务器
      </span>
    </div>
  );
}

/* ---------- 照片行 ---------- */
function PhotoRow({
  photo,
  albums,
  checked,
  onToggle,
  onEdit,
  onRestore,
  onPurge,
  inTrash,
}: {
  photo: Photo;
  albums: Album[];
  checked: boolean;
  onToggle: () => void;
  onEdit: (p: Partial<Photo>) => void;
  onRestore: () => void;
  onPurge: () => void;
  inTrash: boolean;
}) {
  // 缩略图走签名 URL：公开直链会绕过权限
  const [thumb, setThumb] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void fetchPhotoUrl(photo.id, "thumb").then((u) => {
      if (alive) setThumb(u);
    });
    return () => {
      alive = false;
    };
  }, [photo.id]);

  return (
    <li className={styles.row}>
      {!inTrash ? (
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          aria-label={`选择 ${photo.title}`}
        />
      ) : null}

      <img
        className={styles.thumb}
        src={thumb ?? undefined}
        alt={photo.title}
        loading="lazy"
      />

      <div className={styles.fields}>
        <input
          className={styles.input}
          value={photo.title}
          onChange={(e) => onEdit({ title: e.target.value })}
          placeholder="标题"
          disabled={inTrash}
        />
        <input
          className={styles.input}
          value={photo.place}
          onChange={(e) => onEdit({ place: e.target.value })}
          placeholder="地点"
          disabled={inTrash}
        />
        <select
          className={styles.input}
          value={photo.albumId}
          onChange={(e) => onEdit({ albumId: e.target.value })}
          disabled={inTrash}
        >
          {albums.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      {/* 可见性：私有照片只有本人能看到，读取走签名 URL */}
      <label className={styles.visibility} title="私有照片仅自己可见">
        <input
          type="checkbox"
          checked={photo.isPublic}
          onChange={(e) => onEdit({ isPublic: e.target.checked })}
          disabled={inTrash}
        />
        <span>{photo.isPublic ? "公开" : "私有"}</span>
      </label>

      <span className={styles.dim}>
        {photo.width}×{photo.height}
      </span>

      {inTrash ? (
        <span className={styles.actions}>
          <button className={styles.mini} onClick={onRestore}>
            恢复
          </button>
          <button className={styles.miniDanger} onClick={onPurge}>
            彻底删除
          </button>
        </span>
      ) : null}
    </li>
  );
}

/* ---------- 用户管理 ---------- */
function UserPanel({
  users,
  me,
  apiBase,
  onChanged,
}: {
  users: PublicUser[];
  me: PublicUser | null;
  apiBase: string;
  onChanged: () => Promise<void>;
}) {
  const [nUser, setNUser] = useState("");
  const [nPass, setNPass] = useState("");
  const [nName, setNName] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [pwFor, setPwFor] = useState<string | null>(null);
  const [pwVal, setPwVal] = useState("");

  /* 重置链接弹层：linkFor 非空即显示，linkInfo 在请求成功后填入 */
  const [linkFor, setLinkFor] = useState<string | null>(null);
  const [linkInfo, setLinkInfo] = useState<ResetLinkResponse | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 组件卸载时清掉 copy 的定时器，避免 setState on unmounted
  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const call = async (path: string, init: RequestInit) => {
    const r = await fetch(`${path}`, {
      ...init,
      credentials: "include",
      headers: { "content-type": "application/json", ...(init.headers ?? {}) },
    });
    const b = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(b.detail ?? b.error ?? `HTTP ${r.status}`);
    return b;
  };

  const addUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      await call("/api/users", {
        method: "POST",
        body: JSON.stringify({
          username: nUser,
          password: nPass,
          displayName: nName || undefined,
        }),
      });
      setNUser(""); setNPass(""); setNName("");
      setMsg({ kind: "ok", text: "用户已创建" });
      await onChanged();
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    }
  };

  const resetPassword = async (id: string) => {
    setMsg(null);
    try {
      await call(`/api/users/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ password: pwVal }),
      });
      setPwFor(null); setPwVal("");
      setMsg({ kind: "ok", text: "密码已更新" });
      await onChanged();
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    }
  };

  const toggleDisabled = async (u: PublicUser) => {
    setMsg(null);
    try {
      await call(`/api/users/${u.id}`, {
        method: "PATCH",
        body: JSON.stringify({ disabled: !u.disabled }),
      });
      await onChanged();
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    }
  };

  const remove = async (u: PublicUser) => {
    if (!confirm(`确定删除用户 ${u.username}？`)) return;
    setMsg(null);
    try {
      await call(`/api/users/${u.id}`, { method: "DELETE" });
      setMsg({ kind: "ok", text: "用户已删除" });
      await onChanged();
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    }
  };

  const generateLink = async (u: PublicUser) => {
    setMsg(null);
    setLinkFor(u.id);
    setLinkInfo(null);
    setCopied(false);
    setLinkBusy(true);
    try {
      const r = await generateResetLink(u.id);
      setLinkInfo(r);
    } catch (e) {
      setLinkFor(null);
      setMsg({ kind: "err", text: (e as Error).message });
    } finally {
      setLinkBusy(false);
    }
  };

  const closeLink = () => {
    setLinkFor(null);
    setLinkInfo(null);
    setCopied(false);
  };

  const copyLink = async () => {
    if (!linkInfo) return;
    try {
      await navigator.clipboard.writeText(linkInfo.url);
      setCopied(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      setMsg({ kind: "err", text: "复制失败，请手动选中链接" });
    }
  };

  const kickUser = async (u: PublicUser) => {
    if (!confirm(`确定吊销 ${u.username} 的所有会话？`)) return;
    setMsg(null);
    try {
      await revokeUserSessions(u.id);
      setMsg({ kind: "ok", text: `已踢出 ${u.username}` });
      await onChanged();
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    }
  };

  return (
    <div>
      {msg ? (
        <p className={msg.kind === "ok" ? styles.ok : styles.err}>{msg.text}</p>
      ) : null}

      {/* 重置链接弹层。点遮罩关闭，点内容不冒泡。
          弹层跟列表是平级，layout 不会受它影响（fixed 居中）。 */}
      {linkFor ? (
        <div className={styles.modalBackdrop} onClick={closeLink}>
          <div
            className={styles.modal}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="重置链接"
          >
            <div className={styles.modalHead}>
              <h3 className={styles.modalTitle}>重置链接</h3>
              <button className={styles.modalClose} onClick={closeLink}>
                关闭
              </button>
            </div>

            <div className={styles.modalUrlRow}>
              <div className={styles.modalUrl}>
                {linkBusy ? "正在生成…" : linkInfo?.url ?? "—"}
              </div>
              <button
                className={`${styles.copyBtn} ${copied ? styles.copyOk : ""}`}
                onClick={copyLink}
                disabled={!linkInfo}
              >
                {copied ? "已复制 ✓" : "复制"}
              </button>
            </div>

            {linkInfo ? (
              <p className={styles.modalMeta}>
                目标用户：<b>{linkInfo.targetUsername}</b>
                {" · "}
                过期时间：<b>{linkInfo.expiresAt}</b>
                {" · "}24 小时内有效
              </p>
            ) : null}

            <p className={styles.modalHint}>
              此链接一次性使用，过期需重新生成。
            </p>
          </div>
        </div>
      ) : null}

      <ul className={styles.list}>
        {users.map((u) => (
          <li key={u.id} className={styles.row}>
            <div className={styles.fields}>
              <input className={styles.input} value={u.username} disabled />
              <input
                className={styles.input}
                value={u.displayName}
                onChange={async (e) => {
                  const v = e.target.value;
                  await call(`/api/users/${u.id}`, {
                    method: "PATCH",
                    body: JSON.stringify({ displayName: v }),
                  }).catch((err) => setMsg({ kind: "err", text: err.message }));
                  await onChanged();
                }}
              />
              <span className={styles.dim}>
                {u.lastLoginAt
                  ? `最近登录 ${u.lastLoginAt.slice(0, 10)}`
                  : "从未登录"}
              </span>
            </div>

            {u.disabled ? <span className={styles.dim}>已停用</span> : null}

            <span className={styles.actions}>
              {pwFor === u.id ? (
                <>
                  <input
                    className={styles.input}
                    type="password"
                    value={pwVal}
                    onChange={(e) => setPwVal(e.target.value)}
                    placeholder="新密码"
                    style={{ width: 130 }}
                  />
                  <button className={styles.mini} onClick={() => resetPassword(u.id)}>
                    保存
                  </button>
                  <button className={styles.mini} onClick={() => setPwFor(null)}>
                    取消
                  </button>
                </>
              ) : (
                <>
                  <button className={styles.mini} onClick={() => setPwFor(u.id)}>
                    改密码
                  </button>
                  <button className={styles.mini} onClick={() => generateLink(u)}>
                    生成重置链接
                  </button>
                  <button className={styles.mini} onClick={() => toggleDisabled(u)}>
                    {u.disabled ? "启用" : "停用"}
                  </button>
                  <button
                    className={styles.miniDanger}
                    onClick={() => kickUser(u)}
                    disabled={u.id === me?.id}
                    title={u.id === me?.id ? "不能吊销自己的会话" : undefined}
                  >
                    踢出此账号
                  </button>
                  <button
                    className={styles.miniDanger}
                    onClick={() => remove(u)}
                    disabled={u.id === me?.id}
                    title={u.id === me?.id ? "不能删除当前登录的账号" : undefined}
                  >
                    删除
                  </button>
                </>
              )}
            </span>
          </li>
        ))}
      </ul>

      <form className={styles.addUser} onSubmit={addUser}>
        <span className={styles.addTitle}>新建用户</span>
        <input
          className={styles.input}
          value={nUser}
          onChange={(e) => setNUser(e.target.value)}
          placeholder="用户名（字母数字，≥3 位）"
        />
        <input
          className={styles.input}
          type="password"
          value={nPass}
          onChange={(e) => setNPass(e.target.value)}
          placeholder="密码（≥8 位）"
          autoComplete="new-password"
        />
        <input
          className={styles.input}
          value={nName}
          onChange={(e) => setNName(e.target.value)}
          placeholder="显示名（可选）"
        />
        <button
          className={styles.primary}
          style={{ width: "auto", marginTop: 0, padding: "9px 20px" }}
          disabled={!nUser || !nPass}
        >
          创建
        </button>
      </form>
    </div>
  );
}
