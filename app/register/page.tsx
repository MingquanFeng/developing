import type { Metadata } from "next";
import RegisterForm from "./RegisterForm";

export const metadata: Metadata = {
  title: "注册",
  description: "注册塞上空许私人相册的访客账号。",
  robots: { index: false, follow: false },
};

export default function RegisterPage() {
  return (
    <main className="acct-page">
      <div className="acct-top">
        <a href="/">← 返回首页</a>
        <span>塞上空许 · 私人相册</span>
      </div>

      <section className="acct-card">
        <span className="acct-kicker">— 注册 / 访客账号</span>
        <h1 className="acct-title">
          <em>登记</em>
          <em>一个名字</em>
        </h1>
        <p className="acct-lede">
          建一个账号，浏览全部相册与原始照片。注册后为访客身份，
          不能上传或修改照片。
        </p>

        <RegisterForm />
      </section>
    </main>
  );
}
