"use client";

import { useEffect, useState } from "react";
import { type PublicUser } from "@/lib/album-client";
import styles from "./register.module.css";

/* ============================================================
   RegisterForm —— 公开注册
   注册成功即登录（Next.js Route Handler 直接下发会话 Cookie）。
   新账号一律是 viewer：能登录浏览，不能上传/改清单/管用户。
   ============================================================ */

type State =
  | { kind: "probe" }
  | { kind: "disabled" }
  | { kind: "form" }
  | { kind: "submitting" }
  | { kind: "done"; user: PublicUser }
  | { kind: "error"; text: string };

function explain(code: string, detail?: string): string {
  switch (code) {
    case "username_taken":
      return "这个用户名已被占用，换一个试试。";
    case "registration_disabled":
      return "注册暂未开放。";
    case "locked":
      return "尝试次数过多，请一小时后再来。";
    case "invalid_input":
      return detail ?? "请检查填写的内容。";
    default:
      return "注册失败，请稍后再试。";
  }
}

export default function RegisterForm() {
  const [state, setState] = useState<State>({ kind: "probe" });
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  useEffect(() => {
    let alive = true;
    fetch(`/api/register-status`, { cache: "no-store", credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive) return;
        setState(d?.enabled ? { kind: "form" } : { kind: "disabled" });
      })
      .catch(() => alive && setState({ kind: "disabled" }));
    return () => {
      alive = false;
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (state.kind === "submitting") return;

    if (password !== confirm) {
      setState({ kind: "error", text: "两次输入的密码不一致。" });
      return;
    }

    setState({ kind: "submitting" });
    try {
      const res = await fetch(`/api/register`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, displayName }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setState({ kind: "error", text: explain(data.error, data.detail) });
        return;
      }
      setState({ kind: "done", user: data.user });
    } catch {
      setState({ kind: "error", text: "连不上后端，请稍后再试。" });
    }
  }

  if (state.kind === "probe") {
    return <p className={styles.hint}>正在检查注册状态…</p>;
  }
  if (state.kind === "disabled") {
    return (
      <div className={styles.closed}>
        <p className={styles.closedTitle}>注册暂未开放</p>
        <p className={styles.copy}>
          本站相册目前为单人维护，暂不提供自助注册。
          <br />
          如需访问私人影像，请直接联系工作室。
        </p>
        <div className={styles.actions}>
          <a href="/album/" className={styles.btnGhost}>
            先去浏览相册
          </a>
        </div>
      </div>
    );
  }

  if (state.kind === "done") {
    return (
      <div className={styles.closed}>
        <p className={styles.closedTitle}>账号已创建</p>
        <p className={styles.copy}>
          欢迎，{state.user.displayName}。你已经登录，可以开始浏览私人影像档案了。
        </p>
        <div className={styles.actions}>
          <a href="/album/" className={styles.btn}>
            进入相册 <span className={styles.arrow}>→</span>
          </a>
        </div>
      </div>
    );
  }

  const busy = state.kind === "submitting";

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      {state.kind === "error" && (
        <p className={styles.error} role="alert">
          {state.text}
        </p>
      )}

      <label className={styles.field}>
        <span className={styles.label}>用户名</span>
        <input
          className={styles.input}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          required
          disabled={busy}
        />
        <span className={styles.help}>3–32 位，字母数字下划线连字符</span>
      </label>

      <label className={styles.field}>
        <span className={styles.label}>显示名（可选）</span>
        <input
          className={styles.input}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          autoComplete="nickname"
          disabled={busy}
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>密码</span>
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
        {busy ? "正在创建…" : "创建账号"}
        {!busy && <span className={styles.arrow}>→</span>}
      </button>

      <p className={styles.note}>
        注册后为访客身份：可浏览相册，不能上传或修改照片。
      </p>
    </form>
  );
}
