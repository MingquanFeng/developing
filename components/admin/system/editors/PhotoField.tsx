"use client";

/**
 * PhotoField —— 「从公开相册选一张」这一小块 UI
 * ------------------------------------------------------------------
 * hero / story / about / series 4 个 editor 的图片字段共用它：
 *   - 已选照片的缩略图预览（/api/photo/[id]/url?v=thumb）
 *   - 「从公开相册选择」→ 打开 ImagePicker
 *   - 「清除选择」→ photoId 置回 null（保留原来的兜底 URL）
 *   - 没选时提示「当前使用兜底图」
 *
 * 只存 photoId —— 签名 URL 900 秒就过期，存进 DB 等于存定时炸弹。
 * URL 由服务端渲染时现签（lib/site-images.ts）。
 *
 * alt 为空时，选中照片会自动填入 photo.title —— 用户之后仍可改。
 */
import { useState } from "react";
import type { Photo } from "@/lib/contracts";
import ImagePicker from "../ImagePicker";
import PhotoThumb from "../PhotoThumb";
import styles from "./editors.module.css";
import adminStyles from "../../admin.module.css";

export type PhotoFieldProps = {
  /** 当前选中的 photoId；null = 用兜底图 */
  photoId: string | null;
  /** 选中照片 / 清除选择（null = 清除） */
  onChange: (photo: Photo | null) => void;
  /** 当前 alt 文本 —— 为空时选照片会自动补 photo.title */
  alt: string;
  onAltChange: (next: string) => void;
  /** 字段标签 */
  label?: string;
  /**
   * 这个字段属于哪儿（"第 1 组封面" 之类）—— 只用来补全按钮的
   * 可访问名。series 5 组各有同名按钮，不加区分读屏时分不清。
   *
   * ⚠️ 拼出来的可访问名必须**包含**按钮上的可见文案（WCAG 2.5.3
   * Label in Name）—— 否则读屏用户听到的名字跟眼睛看到的对不上。
   */
  context?: string;
};

export default function PhotoField({
  photoId,
  onChange,
  alt,
  onAltChange,
  label = "公开相册照片",
  context,
}: PhotoFieldProps) {
  const [open, setOpen] = useState(false);

  const pick = (photo: Photo) => {
    onChange(photo);
    /* alt 空着才自动填 —— 已填的（多半是用户手写的）不动 */
    if (!alt.trim() && photo.title) onAltChange(photo.title);
    setOpen(false);
  };

  const clear = () => {
    onChange(null);
    setOpen(false);
  };

  /* 可访问名 = 可见文案（+ 上下文补充），别把可见文案换掉 */
  const pickName = context ? `从公开相册选择（${context}）` : undefined;
  const clearName = context ? `清除选择（${context}）` : undefined;

  return (
    <div className={styles.row}>
      <span className={styles.label}>{label}</span>
      <div className={styles.photoField}>
        {photoId ? (
          <PhotoThumb
            photoId={photoId}
            alt={alt}
            className={styles.photoFieldThumb}
          />
        ) : (
          <span className={styles.hint}>当前使用兜底图</span>
        )}
        <div className={styles.photoFieldActions}>
          <button
            type="button"
            className={`${adminStyles.btn} ${adminStyles.btnGhost}`}
            onClick={() => setOpen(true)}
            aria-label={pickName}
          >
            从公开相册选择
          </button>
          {photoId ? (
            <button
              type="button"
              className={`${adminStyles.btn} ${adminStyles.btnGhost}`}
              onClick={clear}
              aria-label={clearName}
            >
              清除选择
            </button>
          ) : null}
        </div>
      </div>

      <ImagePicker
        open={open}
        onClose={() => setOpen(false)}
        onSelect={pick}
        selectedId={photoId}
      />
    </div>
  );
}
