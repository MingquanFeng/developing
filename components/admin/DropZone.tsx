"use client";

/**
 * DropZone —— 后台上传入口（大块 dashed border 拖拽区）
 * ------------------------------------------------------------------
 * 仅渲染视觉层：dashed 边框圆角矩形 + 居中云上传 icon（SVG）+ 主标题
 * "点击上传 或 拖拽文件到此处" + 副标题"支持 JPG, PNG, WEBP 等格式"。
 *
 * 整页 window 级拖拽监听已在 AdminApp 顶层挂 useGlobalFileDrop 接管，
 * 这里只负责 click 调起隐藏 input → 走相同的 onFiles 链路（→ useUploadQueue）。
 *
 * 不持有任何业务状态；通过 onFiles 回调。
 */
import { useRef } from "react";
import styles from "./admin.module.css";

export type DropZoneProps = {
  onFiles: (files: File[]) => void;
  busy: boolean;
  pending: number;
};

export default function DropZone({ onFiles, busy, pending }: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  /* busy || pending > 0 时缩 padding、隐藏大 SVG，但仍保留 dashed border 卡片视觉。
     把"上传中…"状态塞进卡片内，而不是把卡片压成赤裸 <p>。 */
  const isUploading = busy || pending > 0;

  return (
    <div
      className={`${styles.dropZoneCard} ${isUploading ? styles.dropZoneCardBusy : ""}`}
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      aria-label={isUploading ? `上传中 ${pending} 张` : "上传照片"}
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
      {/* 大 SVG icon 在 uploading 时隐藏，省下 56+56 = 112px 高度 */}
      {!isUploading ? (
        <span className={styles.dropZoneIcon} aria-hidden>
          <svg
            width="56"
            height="56"
            viewBox="0 0 56 56"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M14 36c0-3.3 2.7-6 6-6h2.4c.6-5.4 5.2-9.6 10.8-9.6 4.7 0 8.7 3 10.2 7.2.3-.06.7-.1 1.1-.1 4.1 0 7.5 3.4 7.5 7.5S48.6 42 44.5 42H20a6 6 0 0 1-6-6Z"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
            <path
              d="M22 32v8m0 0 4-4m-4 4-4-4"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      ) : null}
      <span className={styles.dropZoneTitle}>
        {isUploading ? `上传中… (${pending})` : "点击上传 或 拖拽文件到此处"}
      </span>
      <span className={styles.dropZoneSub}>
        {isUploading
          ? "正在处理已选择的文件，请稍候"
          : "支持 JPG, PNG, WEBP, AVIF · 单张 ≤ 50MB"}
      </span>
    </div>
  );
}
