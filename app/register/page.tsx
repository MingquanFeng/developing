import type { Metadata } from "next";
import RegisterForm from "./RegisterForm";
import styles from "./register.module.css";

/**
 * 注册页
 * ------------------------------------------------------------------
 * 开放自助注册（REGISTRATION_OPEN=true 时），新账号一律是 viewer：
 * 能登录浏览，不能上传照片 / 改相册清单 / 管用户。
 *
 * 注意照片本身是公开的 —— 注册只决定「谁能建账号」，
 * 不决定「谁能看照片」。授权在 COS 桶策略那一层。
 *
 * REGISTRATION_OPEN 没开时后端 /api/register-status 回 enabled:false，
 * 表单自动降级成「暂未开放」，前端不硬编码这个状态。
 */
export const metadata: Metadata = {
  title: "注册",
  description: "注册塞上空许私人相册的访客账号。",
  robots: { index: false, follow: false },
};

export default function RegisterPage() {
  return (
    <main className={styles.page}>
      <div className={styles.top}>
        <a href="/">← 返回首页</a>
        <span>塞上空许 · 私人相册</span>
      </div>

      <section className={styles.card}>
        <span className={styles.kicker}>— 注册 / 访客账号</span>
        <h1 className={styles.title}>
          <em>登记</em>
          <em>一个名字</em>
        </h1>
        <p className={styles.lede}>
          建一个账号，浏览全部相册与原始照片。
          注册后为访客身份，不能上传或修改照片。
        </p>

        <RegisterForm />
      </section>
    </main>
  );
}
