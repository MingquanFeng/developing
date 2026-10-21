"use client";

/**
 * SiteEditor —— 站点 meta 编辑器
 * ------------------------------------------------------------------
 * 字段：name / nameEn / title / description / projectName / edition /
 *       foundedYear / cities[] / marquee[2]
 *
 * ⚠️ locale 刻意不在此 —— 它用于 `<html lang>`，写在 app/layout.tsx 的
 * RootLayout 组件体里；那处读 DB 会让 layout 变 dynamic，把 /album 的
 * force-static 传染成动态。locale 保持静态。
 *
 * 生效范围：
 *   - name  → 顶栏 brand + 页脚 brand + metadata（authors/creator/
 *              openGraph.siteName / title 模板）
 *   - title / description → metadata + openGraph + twitter
 *   - marquee → 顶部跑马灯两行
 */
import { useEffect, useRef, useState } from "react";
import type { SiteContentData } from "@/lib/contracts";
import type { Writable } from "./_writable";
import styles from "./editors.module.css";
import adminStyles from "../../admin.module.css";

export type SiteEditorProps = {
  data: Writable<SiteContentData>;
  busy: boolean;
  onSave: (content: Writable<SiteContentData>) => Promise<void>;
  onReset: () => Promise<void>;
  onRequestConfirm: (opts: {
    title: string;
    body: string;
    danger?: boolean;
    confirmLabel?: string;
  }) => Promise<boolean>;
};

export default function SiteEditor({
  data,
  busy,
  onSave,
  onReset,
  onRequestConfirm,
}: SiteEditorProps) {
  const [draft, setDraft] = useState<Writable<SiteContentData>>(data);
  const dirtyRef = useRef(false);
  useEffect(() => {
    if (!dirtyRef.current) setDraft(data);
  }, [data]);

  const update = <K extends keyof Writable<SiteContentData>>(
    k: K,
    v: Writable<SiteContentData>[K],
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
      title: "重置站点 meta 为默认",
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
      <div className={styles.rowSplit}>
        <div className={styles.row}>
          <span className={styles.label}>站点名（中文）</span>
          <input
            className={styles.input}
            aria-label="站点名（中文）"
            value={draft.name}
            onChange={(e) => update("name", e.target.value)}
          />
          <span className={styles.hint}>顶栏 / 页脚 brand + metadata</span>
        </div>
        <div className={styles.row}>
          <span className={styles.label}>站点名（英文）</span>
          <input
            className={styles.input}
            value={draft.nameEn}
            onChange={(e) => update("nameEn", e.target.value)}
          />
        </div>
      </div>

      <div className={styles.row}>
        <span className={styles.label}>页面标题（metadata title）</span>
        <input
          className={styles.input}
          aria-label="页面标题（metadata title）"
          value={draft.title}
          onChange={(e) => update("title", e.target.value)}
        />
      </div>

      <div className={styles.row}>
        <span className={styles.label}>页面描述（metadata description）</span>
        <textarea
          className={styles.textarea}
          value={draft.description}
          onChange={(e) => update("description", e.target.value)}
        />
      </div>

      <div className={styles.rowSplit}>
        <div className={styles.row}>
          <span className={styles.label}>项目名</span>
          <input
            className={styles.input}
            value={draft.projectName}
            onChange={(e) => update("projectName", e.target.value)}
          />
        </div>
        <div className={styles.row}>
          <span className={styles.label}>版次</span>
          <input
            type="number"
            className={styles.input}
            value={draft.edition}
            onChange={(e) => update("edition", Number(e.target.value) || 0)}
          />
        </div>
      </div>

      <div className={styles.row}>
        <span className={styles.label}>起始年份</span>
        <input
          type="number"
          className={styles.input}
          value={draft.foundedYear}
          onChange={(e) => update("foundedYear", Number(e.target.value) || 0)}
        />
      </div>

      <div className={styles.row}>
        <span className={styles.label}>城市（逗号分隔）</span>
        <input
          className={styles.input}
          value={draft.cities.join(", ")}
          onChange={(e) =>
            update(
              "cities",
              e.target.value
                .split(",")
                .map((c) => c.trim())
                .filter(Boolean),
            )
          }
        />
      </div>

      <div className={styles.row}>
        <span className={styles.label}>顶部跑马灯（两行）</span>
        <textarea
          className={styles.textarea}
          value={draft.marquee.join("\n")}
          onChange={(e) =>
            update(
              "marquee",
              e.target.value
                .split("\n")
                .map((s) => s.trim())
                .filter(Boolean)
                .slice(0, 2) as unknown as Writable<SiteContentData>["marquee"],
            )
          }
        />
        <span className={styles.hint}>固定 2 行（跑马灯中间用「—」分隔）</span>
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