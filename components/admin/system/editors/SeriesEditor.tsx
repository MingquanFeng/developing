"use client";

/**
 * SeriesEditor —— 第 03 幕 WORKS 的 5 组作品系列编辑器
 * ------------------------------------------------------------------
 * 每组 10 字段：key / albumSlug / no / name / meta / note / image /
 * imageAlt / figLabel / figCaption
 *
 * ⚠️ 语义说明：
 *   - `image` 是**兜底图** —— server 层 lib/series-covers 会把
 *     image/imageAlt 替换成 COS 签名 URL（当对应 album 有公开封面时）。
 *     改它只影响"COS 封面取不到"的场景。
 *   - `key` 是 React key + 数据关联主键，**不暴露编辑**（改了会让
 *     封面 enrichment 找不到对应关系）。
 *   - `albumSlug` 关联 COS album，**不暴露编辑**（改了会串封面）。
 *
 * 5 组各 40+ 输入框会撑爆页面 —— 每组一个子 <details> 折叠。
 */
import { useEffect, useRef, useState } from "react";
import type { series } from "@/lib/data/home";
import type { Writable } from "./_writable";
import styles from "./editors.module.css";
import adminStyles from "../../admin.module.css";

export type SeriesEditorProps = {
  data: Writable<typeof series>;
  busy: boolean;
  onSave: (content: Writable<typeof series>) => Promise<void>;
  onReset: () => Promise<void>;
  onRequestConfirm: (opts: {
    title: string;
    body: string;
    danger?: boolean;
    confirmLabel?: string;
  }) => Promise<boolean>;
};

type Item = {
  key: string;
  albumSlug: string;
  no: string;
  name: string;
  meta: string;
  note: string;
  image: string;
  imageAlt: string;
  figLabel: string;
  figCaption: string;
};

/** 可编辑的字段（key / albumSlug 不在其中） */
const EDITABLE = [
  "no",
  "name",
  "meta",
  "note",
  "image",
  "imageAlt",
  "figLabel",
  "figCaption",
] as const;

const FIELD_LABEL: Record<(typeof EDITABLE)[number], string> = {
  no: "序号",
  name: "系列名",
  meta: "副信息",
  note: "说明",
  image: "兜底图 URL",
  imageAlt: "兜底图 alt",
  figLabel: "图注标签",
  figCaption: "图注说明",
};

export default function SeriesEditor({
  data,
  busy,
  onSave,
  onReset,
  onRequestConfirm,
}: SeriesEditorProps) {
  const [draft, setDraft] = useState<Writable<typeof series>>(data);
  const dirtyRef = useRef(false);
  useEffect(() => {
    if (!dirtyRef.current) setDraft(data);
  }, [data]);

  const [hint, setHint] = useState<
    { kind: "ok" | "err"; text: string } | null
  >(null);

  const items = draft as unknown as Item[];

  const setItems = (next: Item[]) => {
    dirtyRef.current = true;
    setDraft(next as unknown as Writable<typeof series>);
  };

  const patchItem = (idx: number, field: (typeof EDITABLE)[number], v: string) => {
    const next = [...items];
    next[idx] = { ...next[idx], [field]: v };
    setItems(next);
  };

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
      title: "重置作品系列为默认",
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
      <span className={styles.hint}>
        5 组作品系列。「兜底图 URL」只在 COS 封面取不到时生效 —— 正常
        情况下首页显示的是后台「设封面」指定的那张。
      </span>

      {items.map((it, i) => (
        <details key={it.key} className={styles.seriesGroup}>
          <summary className={styles.seriesSummary}>
            <span className={styles.seriesNo}>{it.no}</span>
            <span>{it.name}</span>
            <span className={styles.seriesMeta}>{it.meta}</span>
          </summary>

          <div className={styles.seriesBody}>
            {EDITABLE.map((f) => (
              <div key={f} className={styles.row}>
                <span className={styles.label}>{FIELD_LABEL[f]}</span>
                {f === "note" || f === "image" ? (
                  <textarea
                    className={styles.textarea}
                    aria-label={`第 ${i + 1} 组 ${FIELD_LABEL[f]}`}
                    value={it[f]}
                    onChange={(e) => patchItem(i, f, e.target.value)}
                  />
                ) : (
                  <input
                    className={styles.input}
                    aria-label={`第 ${i + 1} 组 ${FIELD_LABEL[f]}`}
                    value={it[f]}
                    onChange={(e) => patchItem(i, f, e.target.value)}
                  />
                )}
              </div>
            ))}
          </div>
        </details>
      ))}

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