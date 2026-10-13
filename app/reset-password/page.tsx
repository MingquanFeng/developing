import type { Metadata } from "next";
import { Suspense } from "react";
import ResetForm from "./ResetForm";
import styles from "./reset-password.module.css";

/**
 * 重置密码页
 * ------------------------------------------------------------------
 * 公开访问，管理员在后台为某用户签发一次性重置链接
 * （URL 形如 /reset-password/?token=xxx，24h 内有效、一次使用）。
 *
 * Nav 不显示入口 —— 管理员走链接直达，避免诱导用户去「找入口」。
 * 索引也关掉，搜索引擎不必收录一次性页面。
 */
export const metadata: Metadata = {
  title: "重置密码",
  description: "通过管理员提供的一次性链接重置账号密码。",
  robots: { index: false, follow: false },
};

export default function ResetPasswordPage() {
  return (
    <main className={styles.page}>
      <div className={styles.top}>
        <a href="/">← 返回首页</a>
        <span>塞上空许 · 私人相册</span>
      </div>

      <section className={styles.card}>
        <span className={styles.kicker}>— 重置密码 / 一次性链接</span>
        <h1 className={styles.title}>
          <em>重置</em>
          <em>密码</em>
        </h1>
        <p className={styles.lede}>
          通过管理员提供的一次性链接设置新密码。
          链接 24 小时内有效、只能使用一次。
        </p>

        <Suspense fallback={<p className={styles.hint}>正在加载…</p>}>
          <ResetForm />
        </Suspense>
      </section>
    </main>
  );
}
