"use client";

/**
 * FooterEditor —— 第 09 幕 FOOTER 编辑器
 * ------------------------------------------------------------------
 * 字段（lib/data/footer）：
 *   - line 单条
 *   - columns[]  —— [{kicker, lines: (string | {text, href})[]}]
 *   - bottom[]   —— 字符串数组，逗号分隔
 */
import { useEffect, useRef, useState } from "react";
import type { footer } from "@/lib/data/footer";
import type { Writable } from "./_writable";
import styles from "./editors.module.css";
import adminStyles from "../../admin.module.css";

export type FooterEditorProps = {
  data: Writable<typeof footer>;
  busy: boolean;
  onSave: (content: Writable<typeof footer>) => Promise<void>;
  onReset: () => Promise<void>;
  onRequestConfirm: (opts: {
    title: string;
    body: string;
    danger?: boolean;
    confirmLabel?: string;
  }) => Promise<boolean>;
};

type FooterColumn = Writable<typeof footer>["columns"][number];
type FooterLine = string | { text: string; href: string };

export default function FooterEditor({
  data,
  busy,
  onSave,
  onReset,
  onRequestConfirm,
}: FooterEditorProps) {
  const [draft, setDraft] = useState<Writable<typeof footer>>(data);
  const dirtyRef = useRef(false);
  useEffect(() => {
    if (!dirtyRef.current) setDraft(data);
  }, [data]);

  const update = <K extends keyof Writable<typeof footer>>(
    k: K,
    v: Writable<typeof footer>[K],
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
      title: "重置页脚为默认",
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
        <span className={styles.label}>顶部一行介绍</span>
        <textarea
          className={styles.textarea}
          value={draft.line}
          onChange={(e) => update("line", e.target.value)}
        />
      </div>

      <div className={styles.row}>
        <span className={styles.label}>三栏</span>
        <ColumnList
          columns={draft.columns as unknown as FooterColumn[]}
          onChange={(v) => update("columns", v as never)}
        />
      </div>

      <div className={styles.row}>
        <span className={styles.label}>底栏（逗号分隔）</span>
        <textarea
          className={styles.textarea}
          value={draft.bottom.join("\n")}
          onChange={(e) =>
            update(
              "bottom",
              e.target.value
                .split("\n")
                .map((s) => s.trim())
                .filter(Boolean),
            )
          }
        />
        <span className={styles.hint}>共 3 行：版权 / 寄语 / 返回顶部</span>
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
   ColumnList —— 增删改 footer 的 columns 数组
   ============================================================ */
function ColumnList({
  columns,
  onChange,
}: {
  columns: FooterColumn[];
  onChange: (next: FooterColumn[]) => void;
}) {
  return (
    <div className={styles.list}>
      {columns.map((col, ci) => (
        <div
          key={ci}
          className={`${styles.card} ${styles.colCard}`}
          style={{
            padding: 12,
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 6,
          }}
        >
          <div className={styles.listItemTriple} style={{ marginBottom: 8 }}>
            <span className={styles.label}>小标题</span>
            <input
              className={styles.input}
              value={col.kicker}
              onChange={(e) => {
                const next = [...columns];
                next[ci] = { ...col, kicker: e.target.value };
                onChange(next);
              }}
            />
            <button
              type="button"
              className={styles.removeBtn}
              onClick={() => onChange(columns.filter((_, j) => j !== ci))}
            >
              删列
            </button>
          </div>
          <div className={styles.label} style={{ marginBottom: 4 }}>
            行
          </div>
          <LinesEditor
            lines={col.lines as FooterLine[]}
            onChange={(next) => {
              const cols = [...columns] as FooterColumn[];
              cols[ci] = { ...col, lines: next } as FooterColumn;
              onChange(cols);
            }}
          />
        </div>
      ))}
      <button
        type="button"
        className={`${adminStyles.btn} ${adminStyles.btnGhost} ${styles.addRow}`}
        onClick={() =>
          onChange([...columns, { kicker: "", lines: [] }])
        }
      >
        + 新增列
      </button>
    </div>
  );
}

/* ============================================================
   LinesEditor —— 增删改 FooterColumn 的 lines（string | {text,href}）
   ============================================================ */
function LinesEditor({
  lines,
  onChange,
}: {
  lines: FooterLine[];
  onChange: (next: FooterLine[]) => void;
}) {
  return (
    <div className={styles.list}>
      {lines.map((l, i) => {
        const isLink = typeof l !== "string";
        return (
          <div key={i} className={styles.listItem}>
            <input
              className={styles.input}
              placeholder="text"
              value={isLink ? l.text : l}
              onChange={(e) => {
                const next = [...lines];
                if (isLink) next[i] = { ...l, text: e.target.value };
                else next[i] = e.target.value;
                onChange(next);
              }}
            />
            <input
              className={styles.input}
              placeholder="href（仅链接行；普通行留空）"
              value={isLink ? l.href : ""}
              onChange={(e) => {
                const next = [...lines];
                const v = e.target.value.trim();
                if (!v && !isLink) {
                  /* 普通行 → 链接行（空 href 也保留链接形态，允许再编辑） */
                  const cur = l;
                  next[i] = { text: cur, href: "" };
                } else if (v && !isLink) {
                  /* 普通行 → 链接行 */
                  next[i] = { text: l, href: v };
                } else if (!v && isLink) {
                  /* 链接行 → 普通行 */
                  next[i] = l.text;
                } else {
                  next[i] = { ...(l as { text: string; href: string }), href: v };
                }
                onChange(next);
              }}
            />
            <button
              type="button"
              className={styles.removeBtn}
              onClick={() => onChange(lines.filter((_, j) => j !== i))}
            >
              删
            </button>
          </div>
        );
      })}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          className={`${adminStyles.btn} ${adminStyles.btnGhost} ${styles.addRow}`}
          onClick={() => onChange([...lines, ""])}
        >
          + 普通行
        </button>
        <button
          type="button"
          className={`${adminStyles.btn} ${adminStyles.btnGhost} ${styles.addRow}`}
          onClick={() =>
            onChange([...lines, { text: "", href: "#" }])
          }
        >
          + 链接行
        </button>
      </div>
    </div>
  );
}