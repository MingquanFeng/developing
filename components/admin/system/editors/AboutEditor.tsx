"use client";

/**
 * AboutEditor —— 第 07 幕 ABOUT 编辑器
 * ------------------------------------------------------------------
 * 字段（lib/data/about）：
 *   - kicker / titleLines[] / titleEmphasisIndex
 *   - ledeTop / ledeHighlight
 *   - portrait / portraitAlt / portraitCap
 *   - photoId     — 公开相册里选中的照片 id（命中时覆盖 portrait）
 *   - exhibitions[] / press[]  （{year, text} 列表，可增删改）
 *   - cta {label, href} / ctaSecondary
 */
import { useEffect, useRef, useState } from "react";
import type { about } from "@/lib/data/about";
import type { Writable } from "./_writable";
import PhotoField from "./PhotoField";
import styles from "./editors.module.css";
import adminStyles from "../../admin.module.css";

export type AboutEditorProps = {
  data: Writable<typeof about>;
  busy: boolean;
  onSave: (content: Writable<typeof about>) => Promise<void>;
  onReset: () => Promise<void>;
  onRequestConfirm: (opts: {
    title: string;
    body: string;
    danger?: boolean;
    confirmLabel?: string;
  }) => Promise<boolean>;
};

const titleLinesText = (arr: readonly string[]) => arr.join("\n");

export default function AboutEditor({
  data,
  busy,
  onSave,
  onReset,
  onRequestConfirm,
}: AboutEditorProps) {
  const [draft, setDraft] = useState<Writable<typeof about>>(data);
  const dirtyRef = useRef(false);
  useEffect(() => {
    if (!dirtyRef.current) setDraft(data);
  }, [data]);

  const update = <K extends keyof Writable<typeof about>>(
    k: K,
    v: Writable<typeof about>[K],
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
      title: "重置「关于」为默认",
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
          value={titleLinesText(draft.titleLines)}
          onChange={(e) =>
            update(
              "titleLines",
              e.target.value.split("\n").map((s) => s.trim()),
            )
          }
        />
        <span className={styles.hint}>强调行用下方 index 指定（从 0 数）</span>
      </div>

      <div className={styles.row}>
        <span className={styles.label}>标题强调 index</span>
        <input
          type="number"
          className={styles.input}
          value={draft.titleEmphasisIndex}
          onChange={(e) =>
            update(
              "titleEmphasisIndex",
              Math.max(0, Number(e.target.value) || 0),
            )
          }
        />
      </div>

      <div className={styles.row}>
        <span className={styles.label}>主介绍（左半）</span>
        <textarea
          className={styles.textarea}
          value={draft.ledeTop}
          onChange={(e) => update("ledeTop", e.target.value)}
        />
      </div>

      <div className={styles.row}>
        <span className={styles.label}>主介绍高亮段（右半 · 链接）</span>
        <textarea
          className={styles.textarea}
          value={draft.ledeHighlight}
          onChange={(e) => update("ledeHighlight", e.target.value)}
        />
      </div>

      <div className={styles.row}>
        <span className={styles.label}>肖像图 URL</span>
        <input
          className={styles.input}
          value={draft.portrait}
          onChange={(e) => update("portrait", e.target.value)}
        />
        <span className={styles.hint}>兜底图 —— 下面没选公开照片时才用它</span>
      </div>

      <PhotoField
        photoId={draft.photoId ?? null}
        alt={draft.portraitAlt}
        onAltChange={(v) => update("portraitAlt", v)}
        onChange={(p) => update("photoId", p?.id ?? null)}
        label="肖像（公开相册）"
        context="摄影师肖像"
      />

      <div className={styles.rowSplit}>
        <div className={styles.row}>
          <span className={styles.label}>肖像 alt</span>
          <input
            className={styles.input}
            value={draft.portraitAlt}
            onChange={(e) => update("portraitAlt", e.target.value)}
          />
        </div>
        <div className={styles.row}>
          <span className={styles.label}>肖像图注</span>
          <input
            className={styles.input}
            value={draft.portraitCap}
            onChange={(e) => update("portraitCap", e.target.value)}
          />
        </div>
      </div>

      <div className={styles.row}>
        <span className={styles.label}>代表个展（年份 / 文本）</span>
        <YearTextList
          items={draft.exhibitions}
          onChange={(v) => update("exhibitions", v)}
        />
      </div>

      <div className={styles.row}>
        <span className={styles.label}>代表出版（年份 / 文本）</span>
        <YearTextList
          items={draft.press}
          onChange={(v) => update("press", v)}
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
        <span className={styles.label}>次级链接文本</span>
        <input
          className={styles.input}
          value={draft.ctaSecondary}
          onChange={(e) => update("ctaSecondary", e.target.value)}
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

/* ============================================================
   YearTextList —— 增删改 {year, text} 行
   ============================================================ */
function YearTextList({
  items,
  onChange,
}: {
  items: readonly { year: string; text: string }[];
  onChange: (next: { year: string; text: string }[]) => void;
}) {
  const list = items as { year: string; text: string }[];
  return (
    <div className={styles.list}>
      {list.map((it, i) => (
        <div key={i} className={styles.listItemQuad}>
          <input
            className={styles.input}
            placeholder="2024"
            value={it.year}
            onChange={(e) => {
              const next = [...list];
              next[i] = { ...it, year: e.target.value };
              onChange(next);
            }}
          />
          <input
            className={styles.input}
            placeholder="事件描述"
            value={it.text}
            onChange={(e) => {
              const next = [...list];
              next[i] = { ...it, text: e.target.value };
              onChange(next);
            }}
          />
          <span />
          <button
            type="button"
            className={styles.removeBtn}
            onClick={() => onChange(list.filter((_, j) => j !== i))}
          >
            删
          </button>
        </div>
      ))}
      <button
        type="button"
        className={`${adminStyles.btn} ${adminStyles.btnGhost} ${styles.addRow}`}
        onClick={() => onChange([...list, { year: "", text: "" }])}
      >
        + 新增
      </button>
    </div>
  );
}