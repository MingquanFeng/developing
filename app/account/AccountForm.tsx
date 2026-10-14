"use client";

import { useEffect, useState } from "react";
import {
  changeOwnPassword,
  type PublicUser,
} from "@/lib/album-client";
import styles from "./account.module.css";

/* ============================================================
   AccountForm —— 登录后账户页
   ------------------------------------------------------------
   流程：
     1. 客户端 fetch /api/session 确认身份。未登录直接 window.location 跳 /admin/
     2. 展示 user 信息（不可改）
     3. 改密表单：调 changeOwnPassword，成功后服务端 Set-Cookie 新 token（浏览器自动用）
        并刷新一次 user 对象（拿新的 sessionVersion）
     4. 登出：POST /api/logout，浏览器跳回 /admin/
   ============================================================ */

type SessionState =
  | { kind: "probe" }
  | { kind: "redirecting" }
  | { kind: "ready"; user: PublicUser };

type PasswordState =
  | { kind: "idle" }
  | { kind: "changing" }
  | { kind: "changed" }
  | { kind: "error"; text: string };

type LogoutState =
  | { kind: "idle" }
  | { kind: "logging-out" };

function formatTime(iso?: string): string {
  if (!iso) return "—";
  // PublicUser 的 createdAt / lastLoginAt 都是 ISO 字符串。把 T 拆开，让 mono 体更好读
  return iso.replace("T", " ").replace(/\..*$/, "").replace("Z", " UTC");
}

export default function AccountForm() {
  const [session, setSession] = useState<SessionState>({ kind: "probe" });
  const [password, setPassword] = useState<PasswordState>({ kind: "idle" });
  const [logout, setLogout] = useState<LogoutState>({ kind: "idle" });

  // 改密表单字段 —— 故意不挂在 PasswordState 里，方便改密成功后保留
  // 用户输入的新密码值（用户体验：能看见自己改了啥）
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");

  /* ---------- 检查 session ---------- */
  useEffect(() => {
    let alive = true;
    fetch(`/api/session`, {
      cache: "no-store",
      credentials: "same-origin",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { ok?: boolean; user?: PublicUser } | null) => {
        if (!alive) return;
        if (data?.ok && data.user) {
          setSession({ kind: "ready", user: data.user });
        } else {
          setSession({ kind: "redirecting" });
          window.location.href = "/admin/";
        }
      })
      .catch(() => {
        if (!alive) return;
        setSession({ kind: "redirecting" });
        window.location.href = "/admin/";
      });

    return () => {
      alive = false;
    };
  }, []);

  /* ---------- 改密 ---------- */
  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (session.kind !== "ready" || password.kind === "changing") return;

    if (newPw.length < 8) {
      setPassword({ kind: "error", text: "新密码至少 8 位。" });
      return;
    }
    if (newPw !== confirmPw) {
      setPassword({ kind: "error", text: "两次输入的密码不一致。" });
      return;
    }

    setPassword({ kind: "changing" });
    try {
      const updated = await changeOwnPassword(currentPw, newPw);
      setSession({ kind: "ready", user: updated });
      setPassword({ kind: "changed" });
      // 故意不清空 newPw / confirmPw —— 让用户看见自己改了什么
      // 只清掉当前密码（输完就过期，不该留在内存里）
      setCurrentPw("");
    } catch (err) {
      const text = err instanceof Error ? err.message : "改密失败，请稍后再试。";
      setPassword({ kind: "error", text });
    }
  }

  /* ---------- 登出 ---------- */
  async function doLogout() {
    if (logout.kind === "logging-out") return;
    setLogout({ kind: "logging-out" });
    try {
      await fetch(`/api/logout`, {
        method: "POST",
        credentials: "same-origin",
      });
    } catch {
      // 忽略网络错误 —— 客户端 cookie 由浏览器清理，照样跳
    }
    window.location.href = "/admin/";
  }

  /* ---------- 渲染 ---------- */
  if (session.kind === "probe" || session.kind === "redirecting") {
    return (
      <p className={styles.hint}>
        {session.kind === "probe" ? "正在确认登录状态…" : "跳转到登录…"}
      </p>
    );
  }

  const user = session.user;
  const busy = password.kind === "changing" || logout.kind === "logging-out";

  return (
    <>
      {/* ===== 个人资料 ===== */}
      <div className={styles.section}>
        <p className={styles.sectionTitle}>个人资料</p>

        <div className={styles.profileGrid}>
          <span className={styles.profileKey}>用户名</span>
          <span className={styles.profileVal}>{user.username}</span>

          <span className={styles.profileKey}>显示名</span>
          <span className={styles.profileVal}>{user.displayName}</span>

          <span className={styles.profileKey}>角色</span>
          <span className={styles.profileVal}>
            {user.role === "admin" ? "管理员" : "访客"}
          </span>

          <span className={styles.profileKey}>注册时间</span>
          <span className={styles.profileVal}>{formatTime(user.createdAt)}</span>

          <span className={styles.profileKey}>最后登录</span>
          <span className={styles.profileVal}>
            {user.lastLoginAt ? formatTime(user.lastLoginAt) : <em className={styles.profilePlaceholder}>—</em>}
          </span>
        </div>
      </div>

      {/* ===== 修改密码 ===== */}
      <form className={styles.form} onSubmit={changePassword} noValidate>
        <p className={styles.sectionTitle}>修改密码</p>

        {password.kind === "changed" && (
          <p className={styles.bannerSuccess} role="status">
            密码已更新，其它设备的会话已自动登出。
          </p>
        )}
        {password.kind === "error" && (
          <p className={styles.banner} role="alert">
            {password.text}
          </p>
        )}

        <label className={styles.field}>
          <span className={styles.label}>当前密码</span>
          <input
            className={styles.input}
            type="password"
            value={currentPw}
            onChange={(e) => setCurrentPw(e.target.value)}
            autoComplete="current-password"
            required
            disabled={busy}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>新密码</span>
          <input
            className={styles.input}
            type="password"
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
            autoComplete="new-password"
            required
            disabled={busy}
          />
          <span className={styles.help}>至少 8 位</span>
        </label>

        <label className={styles.field}>
          <span className={styles.label}>确认新密码</span>
          <input
            className={styles.input}
            type="password"
            value={confirmPw}
            onChange={(e) => setConfirmPw(e.target.value)}
            autoComplete="new-password"
            required
            disabled={busy}
          />
        </label>

        <button className={styles.btn} type="submit" disabled={busy}>
          {password.kind === "changing" ? "正在更新…" : "更新密码"}
          {password.kind !== "changing" && (
            <span className={styles.arrow}>→</span>
          )}
        </button>
      </form>

      {/* ===== 登出 ===== */}
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.btnGhost}
          onClick={doLogout}
          disabled={busy}
        >
          {logout.kind === "logging-out" ? "正在登出…" : "登出"}
        </button>
        <a href="/album" className={styles.btnGhost}>
          返回相册
        </a>
      </div>
    </>
  );
}
