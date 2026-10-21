"use client";

/**
 * InterludeEditor —— 手记 01 / 03 编辑器（两节共用）
 * ------------------------------------------------------------------
 * 01：kicker + quote[] + emphasisIndex + sig
 * 03：kicker + quote[] + sig（无 emphasisIndex）
 *
 * showEmphasis=false 时隐藏"强调行 index"字段。
 */
import { useEffect, useRef, useState } from "react";
import type { interlude01, interlude03 } from "@/lib/data/home";
import type { Writable } from "./_writable";
import styles from "./editors.module.css";
import adminStyles from "../../admin.module.css";

export type InterludeEditorProps = {
  data: Writable<typeof interlude01> | Writable<typeof interlude03>;
  busy: boolean;
  /** 01 有 emphasisIndex，03 没有 */
  showEmphasis: boolean;
  onSave: (content: never) => Promise<void>;
  onReset: () => Promise<void>;
  onRequestConfirm: (opts: {
    title: string;
    body: string;
    danger?: boolean;
    confirmLabel?: string;
  }) => Promise<boolean>;
};

type Draft = {
  kicker: string;
  quote: string[];
  emphasisIndex?: number;
  sig: string;
};

export default function InterludeEditor({
  data,
  busy,
  showEmphasis,
  onSave,
  onReset,
  onRequestConfirm,
}: InterludeEditorProps) {
  const [draft, setDraft] = useState<Draft>(
    data as unknown as Draft,
  );
  const dirtyRef = useRef(false);
  useEffect(() => {
    if (!dirtyRef.current) setDraft(data as unknown as Draft);
  }, [data]);

  const update = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    dirtyRef.current = true;
    setDraft((d) => ({ ...d, [k]: v }));
  };

  const [hint, setHint] = useState<
    { kind: "ok" | "err"; text: string } | null
  >(null);

  const save = async () => {
    setHint(null);
    try {
      await onSave(draft as never);
      setHint({ kind: "ok", text: "已保存" });
      dirtyRef.current = false;
    } catch (e) {
      setHint({ kind: "err", text: (e as Error).message });
    }
  };

  const reset = async () => {
    const ok = await onRequestConfirm({
      title: "重置为默认",
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
        <span className={styles.label}>引文（每行一项）</span>
        <textarea
          className={styles.textarea}
          value={draft.quote.join("\n")}
          onChange={(e) =>
            update(
              "quote",
              e.target.value.split("\n").map((s) => s.trim()),
            )
          }
        />
      </div>

      {showEmphasis ? (
        <div className={styles.row}>
          <span className={styles.label}>强调行 index（从 0 数）</span>
          <input
            type="number"
            className={styles.input}
            value={draft.emphasisIndex ?? 0}
            onChange={(e) =>
              update("emphasisIndex", Math.max(0, Number(e.target.value) || 0))
            }
          />
          <span className={styles.hint}>
            该行的文字会以斜体强调；-1 表示不强调
          </span>
        </div>
      ) : null}

      <div className={styles.row}>
        <span className={styles.label}>落款</span>
        <input
          className={styles.input}
          value={draft.sig}
          onChange={(e) => update("sig", e.target.value)}
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