import type { Metadata } from "next";
import AccountForm from "./AccountForm";
import styles from "./account.module.css";

/**
 * 账户页
 * ------------------------------------------------------------------
 * 登录后才能看。session 检查由 AccountForm 在浏览器里做 —— page 是
 * server component，没法 fetch /api/session，所以「未登录跳 /admin/」
 * 的逻辑放在客户端。未登录瞬间会闪一下空页，无所谓，登录页本身
 * 长得也类似，不至于把用户吓走。
 */
export const metadata: Metadata = {
  title: "账户",
  description: "查看账号信息、修改密码。",
  robots: { index: false, follow: false },
};

export default function AccountPage() {
  return (
    <main className={styles.page}>
      <div className={styles.top}>
        <a href="/">← 返回首页</a>
        <span>塞上空许 · 私人相册</span>
      </div>

      <section className={styles.card}>
        <span className={styles.kicker}>— 账户 / 个人资料</span>
        <h1 className={styles.title}>
          <em>你的</em>
          <em>姓名牌</em>
        </h1>
        <p className={styles.lede}>
          查看你的账号信息，并在必要时修改密码。
          改密后其它设备的会话会自动登出。
        </p>

        <AccountForm />
      </section>
    </main>
  );
}
