"use client";

/**
 * NavEditor —— 顶导航编辑器
 * ------------------------------------------------------------------
 * 字段：items[{label, href}] —— 可增删改。
 *
 * href 白名单（服务端 isNav 守卫会再校验一次）：
 *   - `#anchor`  页内锚点，anchor 限已知 section id
 *   - `/path`    站内绝对路径
 * 其余（相对路径 / `javascript:` / `//外站`）会被服务端拒绝。
 */
import { useEffect, useRef, useState } from "react";
import type { nav } from "@/lib/data/nav";
import { NAV_ANCHORS } from "@/lib/data/nav";
import type { Writable } from "./_writable";
import styles from "./editors.module.css";
import adminStyles from "../../admin.module.css";

export type NavEditorProps = {
  data: Writable<typeof nav>;
  busy: boolean;
  onSave: (content: Writable<typeof nav>) => Promise<void>;
  onReset: () => Promise<void>;
  onRequestConfirm: (opts: {
    title: string;
    body: string;
    danger?: boolean;
    confirmLabel?: string;
  }) => Promise<boolean>;
};

export default function NavEditor({
  data,
  busy,
  onSave,
  onReset,
  onRequestConfirm,
}: NavEditorProps) {
  const [draft, setDraft] = useState<Writable<typeof nav>>(data);
  const dirtyRef = useRef(false);
  useEffect(() => {
    if (!dirtyRef.current) setDraft(data);
  }, [data]);

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
      title: "重置顶导航为默认",
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

  const items = draft as { label: string; href: string }[];

  const setItems = (next: { label: string; href: string }[]) => {
    dirtyRef.current = true;
    setDraft(next as Writable<typeof nav>);
  };

  return (
    <div className={styles.editor}>
      <div className={styles.row}>
        <span className={styles.label}>导航项（可增删改）</span>
        <div className={styles.list}>
          {items.map((it, i) => (
            <div key={i} className={styles.listItem}>
              <input
                className={styles.input}
                aria-label={`导航项 ${i + 1} 文案`}
                placeholder="文案（如：作品）"
                value={it.label}
                onChange={(e) => {
                  const next = [...items];
                  next[i] = { ...it, label: e.target.value };
                  setItems(next);
                }}
              />
              <input
                className={styles.input}
                aria-label={`导航项 ${i + 1} 链接`}
                placeholder="#works 或 /album/"
                value={it.href}
                onChange={(e) => {
                  const next = [...items];
                  next[i] = { ...it, href: e.target.value };
                  setItems(next);
                }}
              />
              <button
                type="button"
                className={styles.removeBtn}
                onClick={() => setItems(items.filter((_, j) => j !== i))}
              >
                删
              </button>
            </div>
          ))}
          <button
            type="button"
            className={`${adminStyles.btn} ${adminStyles.btnGhost} ${styles.addRow}`}
            onClick={() => setItems([...items, { label: "", href: "#hero" }])}
          >
            + 新增
          </button>
        </div>
        <span className={styles.hint}>
          href 只接受页内锚点（{NAV_ANCHORS.join(" / ")}）或站内绝对路径（/…）；
          其它写法保存时会被服务端拒绝。
        </span>
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