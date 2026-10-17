"use client";

/**
 * DropZone —— 后台拖拽上传区
 * ------------------------------------------------------------------
 * - 同时支持拖拽和点击（点击调起隐藏 input）
 * - 收到文件只过滤 image/* mime；其它校验交给 useUploadQueue 内部
 * - 状态：over (高亮) — 不与上传进度绑，仅视觉反馈
 *
 * 不持有业务状态；通过 onFiles 回调。
 */
import { useRef, useState } from "react";
import styles from "./admin.module.css";

export type DropZoneProps = {
  onFiles: (files: File[]) => void;
  busy: boolean;
  pending: number;
};

export default function DropZone({ onFiles, busy, pending }: DropZoneProps) {
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
