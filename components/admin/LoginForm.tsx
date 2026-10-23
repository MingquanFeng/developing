"use client";

/**
 * LoginForm —— 后台登录表单
 * ------------------------------------------------------------------
 * 表单态（username / password）由父 hook（useAdminSession）持有；
 * 本组件只渲染 + 把表单数据回弹。
 *
 * UI 与 /register 100% 复用 globals.css 里的 .acct-* 公共样式。
 *
 * 注意 username/password 必须在父组件持有，而不是本组件 local state，
 * 否则登录失败后用户输入会被丢掉，必须重打。这里按 PR-5 的目标将状态
 * 提到 hook，不在内部 state。
 */
import type { FormEvent } from "react";

export type LoginFormProps = {
  username: string;
  password: string;
  busy: boolean;
  error: string;
  onUsernameChange: (v: string) => void;
  onPasswordChange: (v: string) => void;
  onSubmit: () => Promise<void>;
};

export default function LoginForm({
  username,
  password,
  busy,
  error,
  onUsernameChange,
  onPasswordChange,
  onSubmit,
}: LoginFormProps) {
  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    await onSubmit();
  };

  return (
    <main className="acct-page">
      <div className="acct-top">
        <a href="/">← 返回首页</a>
        <span>塞上空许 · 私人相册</span>
      </div>

      <section className="acct-card">
        <span className="acct-kicker">— 工作室 / 登录</span>
        <h1 className="acct-title">
          <em>工作室</em>
        </h1>
        <p className="acct-lede">
          登录以管理照片、站点内容与用户。改密与踢人均在「账户」页可自助完成。
        </p>

        <form className="acct-form" onSubmit={handleSubmit} noValidate>
          <label className="acct-field">
            <span className="acct-label">用户名</span>
            <input
              className="acct-input"
              value={username}
              onChange={(e) => onUsernameChange(e.target.value)}
              autoFocus
              autoComplete="username"
              required
              disabled={busy}
            />
          </label>

          <label className="acct-field">
            <span className="acct-label">密码</span>
            <input
              className="acct-input"
              type="password"
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
              autoComplete="current-password"
              required
              disabled={busy}
            />
          </label>

          {error ? (
            <p className="acct-error" role="alert">
              {error}
            </p>
          ) : null}

          <button
            className="acct-btn"
            type="submit"
            disabled={busy || !username || !password}
          >
            {busy ? "验证中…" : "进入"}
            {!busy ? <span className="acct-arrow">→</span> : null}
          </button>

          <p className="acct-note">
            非公开页。访客请走 <a href="/">首页</a> 或{" "}
            <a href="/register">注册</a>。
          </p>
        </form>
      </section>
    </main>
  );
}
