"use client";

/**
 * SubscribeEditor —— 第 08 幕 SUBSCRIBE 编辑器
 * ------------------------------------------------------------------
 * 字段（lib/data/subscribe）：
 *   - kicker / titleLines[] / copy / placeholder / button / success
 */
import { useEffect, useRef, useState } from "react";
import type { subscribe } from "@/lib/data/subscribe";
import type { Writable } from "./_writable";
import styles from "./editors.module.css";
import adminStyles from "../../admin.module.css";

export type SubscribeEditorProps = {
  data: Writable<typeof subscribe>;
  busy: boolean;
  onSave: (content: Writable<typeof subscribe>) => Promise<void>;
  onReset: () => Promise<void>;
  onRequestConfirm: (opts: {
    title: string;
    body: string;
    danger?: boolean;
    confirmLabel?: string;
  }) => Promise<boolean>;
};

export default function SubscribeEditor({
  data,
  busy,
  onSave,
  onReset,
  onRequestConfirm,
}: SubscribeEditorProps) {
  const [draft, setDraft] = useState<Writable<typeof subscribe>>(data);
  const dirtyRef = useRef(false);
  useEffect(() => {
    if (!dirtyRef.current) setDraft(data);
  }, [data]);

  const update = <K extends keyof Writable<typeof subscribe>>(
    k: K,
    v: Writable<typeof subscribe>[K],
  ) => {
    dirtyRef.current = true;
    setDraft((d) => ({ ...d, [k]: v }));
  };

  const [hint, setHint] = useState<
    { kind: "ok" | "err"; text: string } | null
  >(null);

  const save = async () => {
    setHint(null);
    try {
      await onSave(draft);
      setHint({ kind: "ok", text: "已保存" });
      dirtyRef.current = false;
    } catch (e) {
      setHint({ kind: "err", text: (e as Error).message });
    }
  };

  const reset = async () => {
    const ok = await onRequestConfirm({
      title: "重置订阅区为默认",
      body: "将删除该 section 的运行时覆盖值，回落到静态默认值。",
      confirmLabel: "重置",
      danger: true,
    });
    if (!ok) return;
    setHint(null);
    try {
      await onReset();
      setHint({ kind: "ok", text: "已重置为默认" });
      dirtyRef.current = false;
    } catch (e) {
      setHint({ kind: "err", text: (e as Error).message });
    }
  };

  return (
    <div className={styles.editor}>
      <div className={styles.row}>
        <span className={styles.label}>Kicker</span>
        <input
          className={styles.input}
          value={draft.kicker}
          onChange={(e) => update("kicker", e.target.value)}
        />
      </div>

      <div className={styles.row}>
        <span className={styles.label}>标题行（每行一项）</span>
        <textarea
          className={styles.textarea}
          value={draft.titleLines.join("\n")}
          onChange={(e) =>
            update(
              "titleLines",
              e.target.value.split("\n").map((s) => s.trim()),
            )
          }
        />
      </div>

      <div className={styles.row}>
        <span className={styles.label}>正文文案</span>
        <textarea
          className={styles.textarea}
          value={draft.copy}
          onChange={(e) => update("copy", e.target.value)}
        />
      </div>

      <div className={styles.rowSplit}>
        <div className={styles.row}>
          <span className={styles.label}>邮箱框占位文本</span>
          <input
            className={styles.input}
            value={draft.placeholder}
            onChange={(e) => update("placeholder", e.target.value)}
          />
        </div>
        <div className={styles.row}>
          <span className={styles.label}>提交按钮文案</span>
          <input
            className={styles.input}
            value={draft.button}
            onChange={(e) => update("button", e.target.value)}
          />
        </div>
      </div>

      <div className={styles.row}>
        <span className={styles.label}>提交成功提示</span>
        <input
          className={styles.input}
          value={draft.success}
          onChange={(e) => update("success", e.target.value)}
        />
      </div>

      <div className={styles.actions}>
        <button
          type="button"
          className={`${adminStyles.btn} ${adminStyles.btnPrimary}`}
          onClick={() => void save()}
          disabled={busy}
        >
          {busy ? "保存中…" : "保存"}
        </button>
        <button
          type="button"
          className={`${adminStyles.btn} ${adminStyles.btnGhost}`}
          onClick={() => void reset()}
          disabled={busy}
        >
          重置为默认
        </button>
        {hint ? (
          <span
            className={
              hint.kind === "ok" ? styles.savedHint : styles.errorHint
            }
          >
            {hint.text}
          </span>
        ) : null}
      </div>
    </div>
  );
}