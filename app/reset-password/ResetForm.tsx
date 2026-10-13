"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { resetPasswordWithToken } from "@/lib/album-client";
import styles from "./reset-password.module.css";

/* ============================================================
   ResetForm —— 公开重置密码
   用户点开管理员发的一次性链接 → 输入新密码 → 提交。
   链接 24h 有效、只能使用一次；所有合法性校验交给后端，
   前端只负责把错误码翻成人话。
   ============================================================ */

type State =
  | { kind: "form" }
  | { kind: "submitting" }
  | { kind: "done" }
  | { kind: "error"; text: string };

/** 把签名服务的错误码翻成人话。和 album-client 里的 explainAccount 风格一致 */
function explain(code: string, detail?: string): string {
  switch (code) {
    case "token_not_found":
      return "链接无效或已被吊销。";
    case "token_used":
      return "此链接已被使用，请重新申请。";
    case "token_expired":
      return "此链接已过期（24h 内有效），请联系管理员重新申请。";
    case "invalid_input":
      return detail ?? "请检查填写的内容。";
    default:
      return "重置失败，请稍后再试。";
  }
}

export default function ResetForm() {
  const params = useSearchParams();
  const token = params?.get("token") ?? "";
  const [state, setState] = useState<State>({ kind: "form" });
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  /* token 为空直接挡住 —— 没拿到就根本不该进表单 */
  if (!token) {
    return (
      <div className={styles.closed}>
        <p className={styles.closedTitle}>链接无效</p>
        <p className={styles.copy}>
          没有找到重置令牌。
          <br />
          请联系管理员重新申请重置链接。
        </p>
        <div className={styles.actions}>
          <a href="/" className={styles.btnGhost}>
            返回首页
          </a>
        </div>
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (state.kind === "submitting") return;

    if (password !== confirm) {
      setState({ kind: "error", text: "两次输入的密码不一致。" });
      return;
    }

    setState({ kind: "submitting" });
    try {
      await resetPasswordWithToken(token, password);
      setState({ kind: "done" });
    } catch (err) {
      // album-client 里的 explainAccount 已经把常见 code 翻成中文了；
      // 这里再兜一层，防备抛出的是 Error("...")
      const msg = err instanceof Error ? err.message : "重置失败，请稍后再试。";
      setState({ kind: "error", text: msg });
    }
  }

  /* ---------- 成功 ---------- */
  if (state.kind === "done") {
    return (
      <div className={styles.closed}>
        <p className={styles.closedTitle}>密码已重置</p>
        <p className={styles.copy}>
          你的密码已更新。请使用新密码重新登录。
        </p>
        <div className={styles.actions}>
          <a href="/admin/" className={styles.btn}>
            去登录 <span className={styles.arrow}>→</span>
          </a>
        </div>
      </div>
    );
  }

  const busy = state.kind === "submitting";

  /* ---------- 表单 ---------- */
  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      {state.kind === "error" && (
        <p className={styles.error} role="alert">
          {state.text}
        </p>
      )}

      <label className={styles.field}>
        <span className={styles.label}>新密码</span>
        <input
          className={styles.input}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          required
          disabled={busy}
        />
        <span className={styles.help}>至少 8 位</span>
      </label>

      <label className={styles.field}>
        <span className={styles.label}>确认密码</span>
        <input
          className={styles.input}
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          required
          disabled={busy}
        />
      </label>

      <button className={styles.btn} type="submit" disabled={busy}>
        {busy ? "正在重置…" : "重置密码"}
        {!busy && <span className={styles.arrow}>→</span>}
      </button>

      <p className={styles.note}>
        重置后原密码立即失效，请用新密码重新登录。
      </p>
    </form>
  );
}
