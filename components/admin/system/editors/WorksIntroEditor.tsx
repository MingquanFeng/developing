"use client";

/**
 * WorksIntroEditor —— 第 03 幕 WORKS 介绍区编辑器
 * ------------------------------------------------------------------
 * 字段：kicker + titleLines[] + titleSuffix + intro + frameHint
 */
import { useEffect, useRef, useState } from "react";
import type { worksIntro } from "@/lib/data/home";
import type { Writable } from "./_writable";
import styles from "./editors.module.css";
import adminStyles from "../../admin.module.css";

export type WorksIntroEditorProps = {
  data: Writable<typeof worksIntro>;
  busy: boolean;
  onSave: (content: Writable<typeof worksIntro>) => Promise<void>;
  onReset: () => Promise<void>;
  onRequestConfirm: (opts: {
    title: string;
    body: string;
    danger?: boolean;
    confirmLabel?: string;
  }) => Promise<boolean>;
};

export default function WorksIntroEditor({
  data,
  busy,
  onSave,
  onReset,
  onRequestConfirm,
}: WorksIntroEditorProps) {
  const [draft, setDraft] = useState<Writable<typeof worksIntro>>(data);
  const dirtyRef = useRef(false);
  useEffect(() => {
    if (!dirtyRef.current) setDraft(data);
  }, [data]);

  const update = <K extends keyof Writable<typeof worksIntro>>(
    k: K,
    v: Writable<typeof worksIntro>[K],
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
      title: "重置 WORKS 介绍为默认",
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
        <span className={styles.label}>标题行（每行一项，斜体强调）</span>
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
        <span className={styles.label}>标题后缀</span>
        <input
          className={styles.input}
          value={draft.titleSuffix}
          onChange={(e) => update("titleSuffix", e.target.value)}
        />
      </div>

      <div className={styles.row}>
        <span className={styles.label}>介绍文案</span>
        <textarea
          className={styles.textarea}
          value={draft.intro}
          onChange={(e) => update("intro", e.target.value)}
        />
      </div>

      <div className={styles.row}>
        <span className={styles.label}>图轨提示语</span>
        <input
          className={styles.input}
          value={draft.frameHint}
          onChange={(e) => update("frameHint", e.target.value)}
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