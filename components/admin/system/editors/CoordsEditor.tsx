"use client";

/**
 * CoordsEditor —— 手记 02 坐标表编辑器
 * ------------------------------------------------------------------
 * 字段：kicker + rows[{no, place, a, b, time}] + sig
 * rows 可增删改。
 */
import { useEffect, useRef, useState } from "react";
import type { coords } from "@/lib/data/home";
import type { Writable } from "./_writable";
import styles from "./editors.module.css";
import adminStyles from "../../admin.module.css";

export type CoordsEditorProps = {
  data: Writable<typeof coords>;
  busy: boolean;
  onSave: (content: Writable<typeof coords>) => Promise<void>;
  onReset: () => Promise<void>;
  onRequestConfirm: (opts: {
    title: string;
    body: string;
    danger?: boolean;
    confirmLabel?: string;
  }) => Promise<boolean>;
};

type Row = { no: string; place: string; a: string; b: string; time: string };

export default function CoordsEditor({
  data,
  busy,
  onSave,
  onReset,
  onRequestConfirm,
}: CoordsEditorProps) {
  const [draft, setDraft] = useState<Writable<typeof coords>>(data);
  const dirtyRef = useRef(false);
  useEffect(() => {
    if (!dirtyRef.current) setDraft(data);
  }, [data]);

  const update = <K extends keyof Writable<typeof coords>>(
    k: K,
    v: Writable<typeof coords>[K],
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
      title: "重置坐标表为默认",
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

  const rows = draft.rows as Row[];

  const setRows = (next: Row[]) => {
    dirtyRef.current = true;
    setDraft((d) => ({ ...d, rows: next }) as Writable<typeof coords>);
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
        <span className={styles.label}>坐标行（可增删改）</span>
        <div className={styles.list}>
          {rows.map((r, i) => (
            <div key={i} className={styles.coordRow}>
              <input
                className={styles.input}
                placeholder="N° 01"
                value={r.no}
                onChange={(e) => {
                  const next = [...rows];
                  next[i] = { ...r, no: e.target.value };
                  setRows(next);
                }}
              />
              <input
                className={styles.input}
                placeholder="地点"
                value={r.place}
                onChange={(e) => {
                  const next = [...rows];
                  next[i] = { ...r, place: e.target.value };
                  setRows(next);
                }}
              />
              <input
                className={styles.input}
                placeholder="A"
                value={r.a}
                onChange={(e) => {
                  const next = [...rows];
                  next[i] = { ...r, a: e.target.value };
                  setRows(next);
                }}
              />
              <input
                className={styles.input}
                placeholder="B"
                value={r.b}
                onChange={(e) => {
                  const next = [...rows];
                  next[i] = { ...r, b: e.target.value };
                  setRows(next);
                }}
              />
              <input
                className={styles.input}
                placeholder="时间"
                value={r.time}
                onChange={(e) => {
                  const next = [...rows];
                  next[i] = { ...r, time: e.target.value };
                  setRows(next);
                }}
              />
              <button
                type="button"
                className={styles.removeBtn}
                onClick={() => setRows(rows.filter((_, j) => j !== i))}
              >
                删
              </button>
            </div>
          ))}
          <button
            type="button"
            className={`${adminStyles.btn} ${adminStyles.btnGhost} ${styles.addRow}`}
            onClick={() =>
              setRows([
                ...rows,
                { no: `N° ${rows.length + 1}`, place: "", a: "", b: "", time: "" },
              ])
            }
          >
            + 新增行
          </button>
        </div>
      </div>

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