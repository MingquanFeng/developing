"use client";

/**
 * ContentEditorModal —— 内容编辑器的弹层
 * ------------------------------------------------------------------
 * 编辑器从右栏内联改成弹框：
 *   - 右栏只留「版本历史」—— 12 个块的编辑器都很长（hero 有十几行
 *     表单 + 5 组系列各 10 个字段），内联的话右栏被表单撑开，
 *     历史列表根本看不见
 *   - 点「编辑内容」/ 版本行的「编辑」→ 弹层里打开编辑器
 *   - 弹层里还能再弹「从公开相册选择」的选图层（两层 fixed 弹层：
 *     同 z-index 时后渲染的盖在上面，选图层在 DOM 里更靠后 ✓）
 *
 * 关闭语义：**未保存的修改会丢**。所以：
 *   - 关闭一律走二次确认（父级用 onRequestConfirm 弹）
 *   - 父级若知道「这一轮已经保存过」，会跳过确认直接关（不烦人）
 *   - 遮罩点击也走同一条路 —— 不是直接关，是弹确认
 */
import { useEffect, type ReactNode } from "react";
import styles from "../admin.module.css";
import vStyles from "./version-list.module.css";

export type ContentEditorModalProps = {
  /** 弹层标题，如「编辑 · 首屏 HERO」 */
  title: string;
  /** 标题下方的一行说明，如「正在编辑版本 #527 的内容」 */
  hint?: string;
  /** 请求关闭（父级决定要不要二次确认） */
  onRequestClose: () => void;
  children: ReactNode;
};

export default function ContentEditorModal({
  title,
  hint,
  onRequestClose,
  children,
}: ContentEditorModalProps) {
  /* Esc 关闭 —— 走同一条「请求关闭」的路子（父级弹确认） */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onRequestClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onRequestClose]);

  /* 锁滚动 —— 弹层开着时背景不该跟着滚 */
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div className={styles.modalBackdrop} onClick={onRequestClose}>
      <div
        className={vStyles.editorModal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className={styles.modalHead}>
          <div>
            <h2 className={styles.modalTitle}>{title}</h2>
            {hint ? <p className={styles.modalHint}>{hint}</p> : null}
          </div>
          <button
            type="button"
            className={styles.modalClose}
            onClick={onRequestClose}
          >
            关闭
          </button>
        </header>

        <div className={vStyles.editorModalBody}>{children}</div>
      </div>
    </div>
  );
}
