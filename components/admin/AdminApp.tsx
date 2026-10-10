"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  EMPTY,
  fetchManifest,
  signerEndpoint,
  type Manifest,
} from "@/lib/album-client";
import { buildImageUrls, type Album, type Photo } from "@/lib/album-types";
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
  const [password, setPassword] = useState("");
  const [loginErr, setLoginErr] = useState("");
  const [busy, setBusy] = useState(false);

  const [data, setData] = useState<Manifest>(EMPTY);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<"photos" | "trash">("photos");

  const signer = signerEndpoint("/api/album");

  /* ---------- 探测会话 ---------- */
  useEffect(() => {
    if (!signer) {
      setAuthed(false);
      return;
    }
    fetch(`${signer}/api/session`, { credentials: "include" })
      .then((r) => setAuthed(r.ok))
      .catch(() => setAuthed(false));
  }, [signer]);

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

  /* ---------- 写清单（带乐观锁重试） ---------- */
  const save = useCallback(
    async (next: Manifest) => {
      for (let attempt = 0; attempt < 3; attempt++) {
        const res = await fetch(`${signer}/api/album`, {
          method: "PUT",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            revision: next.revision,
            albums: next.albums,
            photos: next.photos,
          }),
        });
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
    [signer],
  );

  /* ---------- 登录 ---------- */
  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setLoginErr("");
    try {
      const res = await fetch(`${signer}/api/login`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.status === 429) throw new Error("尝试过多，已锁定 15 分钟");
      if (res.status === 503) throw new Error("服务端未配置登录口令");
      if (!res.ok) throw new Error("口令不正确");
      setPassword("");
      setAuthed(true);
    } catch (e) {
      setLoginErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    await fetch(`${signer}/api/logout`, {
      method: "POST",
      credentials: "include",
    }).catch(() => {});
    setAuthed(false);
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
    await runUpload(snapshot, signer!, {
      onChange: setQueue,
      onComplete: async (uploaded) => {
        if (!uploaded.length) {
          setNotice({ kind: "err", text: "没有成功的文件" });
          return;
        }
        try {
          const cur = await fetchManifest();
          const albumId = cur.albums[0]?.id ?? "alb_misc";
          const photos: Photo[] = uploaded.map((u, i) => ({
            id: `ph_${Date.now().toString(36)}${i}`,
            key: u.key,
            albumId,
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
            albums: cur.albums.length ? cur.albums : [defaultAlbum()],
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
  }, [queue, signer, save]);

  /* ---------- 编辑 ---------- */
  const editPhoto = async (id: string, patch: Partial<Photo>) => {
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
        const r = await fetch(`${signer}/api/photo/${id}`, {
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
      const r = await fetch(`${signer}/api/photo/${id}/restore`, {
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
      const r = await fetch(`${signer}/api/photo/${id}/purge`, {
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

  if (!signer) {
    return (
      <Frame>
        <Block title="未配置签名服务">
          <p>
            请在项目根目录的 <code>.env.local</code> 里设置{" "}
            <code>NEXT_PUBLIC_SIGNER_URL</code>，指向签名服务地址，然后重启站点。
          </p>
        </Block>
      </Frame>
    );
  }

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
          <p className={styles.loginSub}>输入口令以管理照片</p>
          <input
            className={styles.input}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="口令"
            autoFocus
            autoComplete="current-password"
          />
          {loginErr ? <p className={styles.err}>{loginErr}</p> : null}
          <button className={styles.primary} disabled={busy || !password}>
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

      {visible.length === 0 ? (
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

function defaultAlbum(): Album {
  return {
    id: "alb_misc",
    slug: "misc",
    name: "未成册",
    desc: "不属于任何一次的随手记录。",
    coverKey: null,
    order: 1,
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
  const { thumb } = buildImageUrls(photo.key);

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

      <img className={styles.thumb} src={thumb} alt={photo.title} loading="lazy" />

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