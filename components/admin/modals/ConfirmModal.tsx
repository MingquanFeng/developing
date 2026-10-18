"use client";

/**
 * ConfirmModal —— 通用确认弹层
 * ------------------------------------------------------------------
 * 替代 window.confirm：与 CoverModal / AlbumEditModal 同款暗色 backdrop +
 * 居中卡片，点遮罩取消。danger 切红边按钮。
 *
 * 状态机由父 hook / AdminApp 持有，本组件只渲染。
 * 同一时刻只允许一个 ConfirmModal 实例打开（AdminApp 用单个 confirmReq
 * state 串行化所有请求）—— 这里不强制，但调用方应自觉。
 *
 * 不挂全局键盘 handler：上层 AlbumEditModal 已处理 Esc / Ctrl+S，本组件
 * 再挂会让两个弹层同时响应同一次按键，关错层。
 */
import styles from "../admin.module.css";

export type ConfirmModalProps = {
  open: boolean;
  title: string;
  /** 多行用 \n；white-space: pre-line 自动保留换行 */
  body: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ConfirmModal({
  open,
  title,
  body,
  confirmLabel = "确认",
  cancelLabel = "取消",
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!open) return null;

  return (
    <div
      className={styles.modalBackdrop}
      onClick={busy ? undefined : onCancel}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{ zIndex: 500 }}
    >
      <div
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
      >
        <header className={styles.modalHead}>
          <h2 className={styles.modalTitle}>{title}</h2>
        </header>
        <p
          className={styles.modalHint}
          style={{ whiteSpace: "pre-line", fontSize: 13 }}
        >
          {body}
        </p>
        <footer
          style={{
            display: "flex",
            gap: 10,
            justifyContent: "flex-end",
            marginTop: 4,
          }}
        >
          <button
            type="button"
            className={styles.ghost}
            onClick={onCancel}
            disabled={busy}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={danger ? `${styles.mini} ${styles.miniDanger}` : styles.mini}
            onClick={onConfirm}
            disabled={busy}
          >
            {confirmLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}