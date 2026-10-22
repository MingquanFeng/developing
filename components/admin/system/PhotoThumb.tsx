"use client";

/**
 * PhotoThumb —— 缩略图（懒加载）
 * ------------------------------------------------------------------
 * 签名读 URL **必须异步取** —— 公开直链会绕过权限。取到之前先占位，
 * 进入视口前 300px 才发起请求（跟 components/album/AlbumBrowser.tsx
 * 的 LazyImg 一个做法：相册页动辄几十张图，一次性全签既慢又浪费）。
 *
 * 用 <img> 而不是 next/image —— 签名 URL 是带 query 的临时地址，
 * 交给图片优化器只会多一跳且随时会过期。
 */
import { useEffect, useRef, useState } from "react";
import { fetchPhotoUrl } from "@/lib/album-client";

/** 1×1 透明 GIF —— src 就位前占位，避免布局跳动，也不发额外请求 */
const BLANK =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

export type PhotoThumbProps = {
  photoId: string;
  alt?: string;
  /** 挂在 <img> 上的 className（尺寸 / 圆角由调用方决定） */
  className?: string;
};

export default function PhotoThumb({
  photoId,
  alt = "",
  className,
}: PhotoThumbProps) {
  const ref = useRef<HTMLImageElement>(null);
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let cancelled = false;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        void fetchPhotoUrl(photoId, "thumb").then((u) => {
          if (!cancelled && u) setSrc(u);
        });
        io.disconnect();
      },
      { rootMargin: "300px" },
    );

    io.observe(el);
    return () => {
      cancelled = true;
      io.disconnect();
    };
  }, [photoId]);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      className={className}
      src={src ?? BLANK}
      alt={alt}
      loading="lazy"
    />
  );
}
