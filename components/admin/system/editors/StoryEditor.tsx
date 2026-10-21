"use client";

/**
 * StoryEditor —— 第 05 幕 STORY 编辑器
 * ------------------------------------------------------------------
 * 字段（lib/data/story）：
 *   - tag / titleMain / titleSub
 *   - image / imageAlt
 *   - copy
 *   - cta {label, href}
 *   - caption
 *   - meta[4]  {label, value}
 */
import { useEffect, useRef, useState } from "react";
import type { story } from "@/lib/data/story";
import type { Writable } from "./_writable";
import styles from "./editors.module.css";
import adminStyles from "../../admin.module.css";

export type StoryEditorProps = {
  data: Writable<typeof story>;
  busy: boolean;
  onSave: (content: Writable<typeof story>) => Promise<void>;
  onReset: () => Promise<void>;
  onRequestConfirm: (opts: {
    title: string;
    body: string;
    danger?: boolean;
    confirmLabel?: string;
  }) => Promise<boolean>;
};

export default function StoryEditor({
  data,
  busy,
  onSave,
  onReset,
  onRequestConfirm,
}: StoryEditorProps) {
  const [draft, setDraft] = useState<Writable<typeof story>>(data);
  const dirtyRef = useRef(false);
  useEffect(() => {
    if (!dirtyRef.current) setDraft(data);
  }, [data]);

  const update = <K extends keyof Writable<typeof story>>(
    k: K,
    v: Writable<typeof story>[K],
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
      title: "重置主推故事为默认",
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
        <span className={styles.label}>Tag（kicker）</span>
        <input
          className={styles.input}
          value={draft.tag}
          onChange={(e) => update("tag", e.target.value)}
        />
      </div>

      <div className={styles.rowSplit}>
        <div className={styles.row}>
          <span className={styles.label}>主标题（中文）</span>
          <input
            className={styles.input}
            value={draft.titleMain}
            onChange={(e) => update("titleMain", e.target.value)}
          />
        </div>
        <div className={styles.row}>
          <span className={styles.label}>副标题（英文）</span>
          <input
            className={styles.input}
            value={draft.titleSub}
            onChange={(e) => update("titleSub", e.target.value)}
          />
        </div>
      </div>

      <div className={styles.row}>
        <span className={styles.label}>主图 URL</span>
        <input
          className={styles.input}
          value={draft.image}
          onChange={(e) => update("image", e.target.value)}
        />
      </div>

      <div className={styles.row}>
        <span className={styles.label}>主图 alt 文本</span>
        <input
          className={styles.input}
          value={draft.imageAlt}
          onChange={(e) => update("imageAlt", e.target.value)}
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
          <span className={styles.label}>CTA 文案</span>
          <input
            className={styles.input}
            value={draft.cta.label}
            onChange={(e) =>
              update("cta", { ...draft.cta, label: e.target.value })
            }
          />
        </div>
        <div className={styles.row}>
          <span className={styles.label}>CTA 链接</span>
          <input
            className={styles.input}
            value={draft.cta.href}
            onChange={(e) =>
              update("cta", { ...draft.cta, href: e.target.value })
            }
          />
        </div>
      </div>

      <div className={styles.row}>
        <span className={styles.label}>底部小字</span>
        <input
          className={styles.input}
          value={draft.caption}
          onChange={(e) => update("caption", e.target.value)}
        />
      </div>

      <div className={styles.row}>
        <span className={styles.label}>四栏元信息（label / value）</span>
        <div className={styles.rowQuad}>
          {draft.meta.map((m, i) => (
            <div key={i} className={styles.listItemQuad}>
              <input
                className={styles.input}
                placeholder="label"
                value={m.label}
                onChange={(e) => {
                  const next = [...draft.meta];
                  next[i] = { ...m, label: e.target.value };
                  update("meta", next);
                }}
              />
              <input
                className={styles.input}
                placeholder="value"
                value={m.value}
                onChange={(e) => {
                  const next = [...draft.meta];
                  next[i] = { ...m, value: e.target.value };
                  update("meta", next);
                }}
              />
            </div>
          ))}
        </div>
        <span className={styles.hint}>共 4 栏，按顺序渲染</span>
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