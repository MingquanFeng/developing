"use client";

/**
 * ResetLinkModal —— 一次性重置链接弹层
 * ------------------------------------------------------------------
 * 状态（linkBusy / linkInfo / copied）由 useUsersPanel 提供。
 * 组件只负责渲染：点遮罩关闭，点内容不冒泡（视觉停在弹层内）。
 */
import type { ResetLinkResponse } from "@/lib/contracts";
import styles from "../admin.module.css";

export type ResetLinkModalProps = {
  linkInfo: ResetLinkResponse | null;
  linkBusy: boolean;
  copied: boolean;
  onCopy: () => void;
  onClose: () => void;
};

export default function ResetLinkModal({
  linkInfo,
  linkBusy,
  copied,
  onCopy,
  onClose,
}: ResetLinkModalProps) {
  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="重置链接"
      >
        <div className={styles.modalHead}>
          <h2 className={styles.modalTitle}>重置链接</h2>
          <button className={styles.modalClose} onClick={onClose}>
            关闭
          </button>
        </div>

        <div className={styles.modalUrlRow}>
          <div className={styles.modalUrl}>
            {linkBusy ? "正在生成…" : linkInfo?.url ?? "—"}
          </div>
          <button
            className={`${styles.copyBtn} ${copied ? styles.copyOk : ""}`}
            onClick={onCopy}
            disabled={!linkInfo}
          >
            {copied ? "已复制 ✓" : "复制"}
          </button>
        </div>

        {linkInfo ? (
          <p className={styles.modalMeta}>
            目标用户：<b>{linkInfo.targetUsername}</b>
            {" · "}
            过期时间：<b>{linkInfo.expiresAt}</b>
            {" · "}24 小时内有效
          </p>
        ) : null}

        <p className={styles.modalHint}>
          此链接一次性使用，过期需重新生成。
        </p>
      </div>
    </div>
  );
}
