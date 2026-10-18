"use client";

/**
 * useGlobalFileDrop —— 整页 window 级拖拽监听
 * ------------------------------------------------------------------
 * 把 DropZone 原本内嵌的 window-level drag-drop 抽出来，让 AdminApp
 * 顶层挂一份。所有 nav 页面都共享同一份监听：拖文件到页面任意位置
 * 都能触发上传，无论当前是 home / photos / albums / system。
 *
 * 行为与原 DropZone 实现一致：
 * - dataTransfer.types 仅响应 `Files`（文字/URL 拖拽不响应）
 * - dragenter/dragleave 用计数器抗子元素抖动
 * - 全屏半透明 overlay 仅给视觉提示；pointer-events: none 让 drop
 *   落到 window 监听器
 * - 只接收 image/* 文件，其他类型静默丢弃
 */
import { useEffect } from "react";

export type GlobalFileDropOptions = {
  onFiles: (files: File[]) => void;
};

const isFileDrag = (e: DragEvent) =>
  Array.from(e.dataTransfer?.types ?? []).includes("Files");

export function useGlobalFileDrop({ onFiles }: GlobalFileDropOptions): void {
  useEffect(() => {
    let depth = 0;
    const onEnter = (e: DragEvent) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      depth++;
      if (depth === 1) document.documentElement.classList.add("fileDragActive");
    };
    const onLeave = (e: DragEvent) => {
      if (!isFileDrag(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0)
        document.documentElement.classList.remove("fileDragActive");
    };
    const onOver = (e: DragEvent) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      depth = 0;
      document.documentElement.classList.remove("fileDragActive");
      const files = Array.from(e.dataTransfer?.files ?? []).filter((f) =>
        f.type.startsWith("image/"),
      );
      if (files.length) onFiles(files);
    };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("dragover", onOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("drop", onDrop);
      document.documentElement.classList.remove("fileDragActive");
    };
  }, [onFiles]);
}
