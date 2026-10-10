"use client";

/**
 * 上传队列
 * ------------------------------------------------------------------
 * 三步：本地预检 → 取签名 → 直传 COS → 一次性写元数据
 *
 * 为什么用 XMLHttpRequest 而不是 fetch：要 upload.onprogress 才能拿到
 * 真实的上传进度，fetch 目前拿不到。
 *
 * 为什么签名一次取一批：/api/sign 最多接受 50 个文件，逐个请求
 * 会让 N 张照片产生 N+1 次往返。
 */

export const MAX_BYTES = 50 * 1024 * 1024;
export const MAX_PER_BATCH = 50;
export const CONCURRENCY = 3;

const OK_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];

export type QueueItem = {
  /** 本地唯一 id，用于 React key 与重试定位 */
  uid: string;
  file: File;
  width: number;
  height: number;
  status: "pending" | "signing" | "uploading" | "done" | "error";
  /** 0 - 100 */
  progress: number;
  /** COS 对象键，上传成功后才有 */
  key?: string;
  error?: string;
};

export type UploadedPhoto = {
  key: string;
  width: number;
  height: number;
  bytes: number;
  title: string;
};

/** 本地预检：类型、大小、能否解码。解码失败的文件直接拒掉，不浪费带宽 */
export async function inspectFile(file: File): Promise<
  { ok: true; width: number; height: number } | { ok: false; reason: string }
> {
  if (!OK_TYPES.includes(file.type)) {
    return { ok: false, reason: `不支持的类型 ${file.type || "未知"}` };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, reason: `超过 ${Math.round(MAX_BYTES / 1024 / 1024)}MB` };
  }
  try {
    const bmp = await createImageBitmap(file);
    const w = bmp.width;
    const h = bmp.height;
    bmp.close();
    return { ok: true, width: w, height: h };
  } catch {
    return { ok: false, reason: "文件无法解码，可能已损坏" };
  }
}

export function newItem(file: File, width: number, height: number): QueueItem {
  return {
    uid: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    file,
    width,
    height,
    status: "pending",
    progress: 0,
  };
}

/** 单文件直传。用 XHR 拿真实进度 */
function putFile(
  url: string,
  file: File,
  onProgress: (p: number) => void,
): Promise<{ ok: boolean; etag?: string; error?: string }> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve({ ok: true, etag: xhr.getResponseHeader("ETag") ?? undefined })
        : resolve({ ok: false, error: `HTTP ${xhr.status}` });
    xhr.onerror = () => resolve({ ok: false, error: "网络错误" });
    xhr.ontimeout = () => resolve({ ok: false, error: "上传超时" });
    xhr.send(file);
  });
}

/** 分批签名。超出会按 MAX_PER_BATCH 切块 */
async function signBatch(
  items: QueueItem[],
  base: string,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (let i = 0; i < items.length; i += MAX_PER_BATCH) {
    const chunk = items.slice(i, i + MAX_PER_BATCH);
    const res = await fetch(`${base}/api/sign`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        files: chunk.map((it) => ({
          name: it.file.name,
          size: it.file.size,
          type: it.file.type,
        })),
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `取签名失败 HTTP ${res.status}`);
    }
    const { items: signed } = (await res.json()) as {
      items: { key: string; url: string }[];
    };
    // 按顺序一一对应，服务端保证按传入顺序生成 key
    chunk.forEach((it, idx) => {
      const s = signed[idx];
      if (s) map.set(it.uid, s.url);
    });
  }
  return map;
}

export type RunHandlers = {
  onChange: (items: QueueItem[]) => void;
  onComplete: (uploaded: UploadedPhoto[]) => void;
  onError: (message: string) => void;
};

/**
 * 跑完整批上传。
 * 单个文件失败只标记该项为 error，不影响其他文件；调用方可单独重试。
 */
export async function runUpload(
  items: QueueItem[],
  signerBase: string,
  handlers: RunHandlers,
): Promise<void> {
  const todo = items.filter((it) => it.status !== "done");
  if (!todo.length) return;

  const patch = (uid: string, p: Partial<QueueItem>) => {
    const target = items.find((x) => x.uid === uid);
    if (!target) return;
    Object.assign(target, p);
    handlers.onChange([...items]);
  };

  /* 1. 取签名 */
  todo.forEach((it) => patch(it.uid, { status: "signing", error: undefined }));
  let urls: Map<string, string>;
  try {
    urls = await signBatch(todo, signerBase);
  } catch (e) {
    const msg = (e as Error).message;
    todo.forEach((it) => patch(it.uid, { status: "error", error: msg }));
    handlers.onError(msg);
    return;
  }

  /* 2. 直传，并发 CONCURRENCY */
  const queue = todo.filter((it) => urls.has(it.uid));
  let cursor = 0;
  const worker = async () => {
    while (cursor < queue.length) {
      const it = queue[cursor++];
      const url = urls.get(it.uid)!;
      patch(it.uid, { status: "uploading", progress: 0 });
      const r = await putFile(url, it.file, (p) =>
        patch(it.uid, { progress: p }),
      );
      if (r.ok) {
        // key 从签名 URL 反解，避免再单独回传一份
        const key = decodeURIComponent(new URL(url).pathname.replace(/^\/+/, ""));
        patch(it.uid, { status: "done", progress: 100, key });
      } else {
        patch(it.uid, { status: "error", error: r.error ?? "上传失败" });
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker),
  );

  /* 3. 汇总成功的，交给上层写元数据 */
  const uploaded: UploadedPhoto[] = items
    .filter((it) => it.status === "done" && it.key)
    .map((it) => ({
      key: it.key!,
      width: it.width,
      height: it.height,
      bytes: it.file.size,
      title: it.file.name.replace(/\.[a-z0-9]+$/i, ""),
    }));

  handlers.onComplete(uploaded);
}

/** 标题默认取文件名去扩展名 */
export const titleFromName = (name: string) =>
  name.replace(/\.[a-z0-9]+$/i, "").slice(0, 60);