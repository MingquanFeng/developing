"use client";

/**
 * HeroEditor —— 第 01 幕 HERO 编辑器
 * ------------------------------------------------------------------
 * 字段（继承 lib/data/home 的 hero 结构）：
 *   - tags[]      — 字符串数组，逗号分隔输入
 *   - titleLines  — 必为 2 行
 *   - image       — 主图 URL
 *   - imageAlt    — alt 文本
 *   - sub         — 副标（一段）
 *   - cta         — { label, href }
 *   - caption     — 下方小字
 *   - meta[4]     — { label, value } 四栏
 */
import { useEffect, useRef, useState } from "react";
import type { hero } from "@/lib/data/home";
import type { Writable } from "./_writable";
import styles from "./editors.module.css";
import adminStyles from "../../admin.module.css";

export type HeroEditorProps = {
  data: Writable<typeof hero>;
  busy: boolean;
  onSave: (content: Writable<typeof hero>) => Promise<void>;
  onReset: () => Promise<void>;
  onRequestConfirm: (opts: {
    title: string;
    body: string;
    danger?: boolean;
    confirmLabel?: string;
  }) => Promise<boolean>;
};

export default function HeroEditor({
  data,
  busy,
  onSave,
  onReset,
  onRequestConfirm,
}: HeroEditorProps) {
  const [draft, setDraft] = useState<Writable<typeof hero>>(data);
  /* dirtyRef：用户改过表单后置 true，阻断 useEffect 同步覆盖。
     保存 / 重置成功后置 false，让 reload 后的新 data 自动同步过来。 */
  const dirtyRef = useRef(false);
  useEffect(() => {
    if (!dirtyRef.current) setDraft(data);
  }, [data]);

  const update = <K extends keyof Writable<typeof hero>>(
    k: K,
    v: Writable<typeof hero>[K],
  ) => {
    dirtyRef.current = true;
    setDraft((d) => ({ ...d, [k]: v }));
  };

  const [hint, setHint] = useState<
    { kind: "ok" | "err"; text: string } | null
  >(null);

  const tagsText = draft.tags.join(", ");

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
      title: "重置首屏为默认",
      body: "将删除该 section 的运行时覆盖值，回落到静态默认值。",
      confirmLabel: "重置",
      danger: true,
    });
    if (!ok) return;
    setHint(null);
    try {
      await onReset();
      /* 不显式 setDraft：reset 成功后 AdminApp 会 reload 一次，
         新 data 通过 useEffect 同步进来。 */
      setHint({ kind: "ok", text: "已重置为默认" });
      dirtyRef.current = false;
    } catch (e) {
      setHint({ kind: "err", text: (e as Error).message });
    }
  };

  return (
    <div className={styles.editor}>
      <div className={styles.row}>
        <span className={styles.label}>标签（逗号分隔）</span>
        <input
          className={styles.input}
          aria-label="标签（逗号分隔）"
          value={tagsText}
          onChange={(e) =>
            update(
              "tags",
              e.target.value
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean),
            )
          }
        />
      </div>

      <div className={styles.rowSplit}>
        <div className={styles.row}>
          <span className={styles.label}>主标题第 1 行</span>
          <input
            className={styles.input}
            aria-label="主标题第 1 行"
            value={draft.titleLines[0]}
            onChange={(e) =>
              update("titleLines", [e.target.value, draft.titleLines[1]])
            }
          />
        </div>
        <div className={styles.row}>
          <span className={styles.label}>主标题第 2 行</span>
          <input
            className={styles.input}
            aria-label="主标题第 2 行"
            value={draft.titleLines[1]}
            onChange={(e) =>
              update("titleLines", [draft.titleLines[0], e.target.value])
            }
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
        <span className={styles.label}>副标文案</span>
        <textarea
          className={styles.textarea}
          aria-label="副标文案"
          value={draft.sub}
          onChange={(e) => update("sub", e.target.value)}
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