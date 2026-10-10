/**
 * 相册清单的数据源
 * ------------------------------------------------------------------
 * 站点是静态导出，没有运行时服务端，所以清单有两条取法：
 *
 *   1. 构建期：next build 时取一次，烘进 index.html
 *      → 首屏直接有图，不用等 JS；SEO 也能抓到
 *   2. 运行时：页面加载后再取一次
 *      → 新上传的照片刷新就能看到，不必重新构建部署
 *
 * 签名服务取不到时降级为空清单 + 错误提示，不让构建失败。
 */

import type { Album, Photo } from "./album-types";

export type Manifest = {
  revision: number;
  updatedAt: string;
  albums: Album[];
  photos: Photo[];
};

export const EMPTY: Manifest = {
  revision: 0,
  updatedAt: "",
  albums: [],
  photos: [],
};

/** 拼签名服务地址。没配 NEXT_PUBLIC_SIGNER_URL 就返回 null */
export function signerEndpoint(path: string): string | null {
  const base = process.env.NEXT_PUBLIC_SIGNER_URL?.trim().replace(/\/+$/, "");
  return base ? `${base}${path}` : null;
}

export async function fetchManifest(signal?: AbortSignal): Promise<Manifest> {
  const url = signerEndpoint("/api/album");
  if (!url) throw new Error("未配置 NEXT_PUBLIC_SIGNER_URL");

  const res = await fetch(url, { cache: "no-store", signal });
  if (!res.ok) throw new Error(`清单接口返回 HTTP ${res.status}`);

  const data = (await res.json()) as Partial<Manifest>;
  return {
    revision: Number(data.revision ?? 0),
    updatedAt: data.updatedAt ?? "",
    albums: Array.isArray(data.albums) ? data.albums : [],
    photos: Array.isArray(data.photos) ? data.photos : [],
  };
}