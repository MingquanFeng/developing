import type { Metadata } from "next";
import { cookies } from "next/headers";
import AdminApp from "@/components/admin/AdminApp";
import { readCookie, verifySession, sessionCookieName } from "@/lib/signer/auth";
import { findById, toPublic } from "@/lib/signer/users";

export const metadata: Metadata = {
  title: "相册后台",
  // 后台页没有对外展示价值，别进搜索索引
  robots: { index: false, follow: false },
};

/** 每次请求都重新读 cookie，确保 session 变化立即生效 */
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  /* server 端读 cookie + 查 user。AdminApp 在 SSR 阶段就拿到 me，
     首屏直接 'authed' 态 —— 不会因 client 端 /api/session 探活失败
     而回退到登录页（"点后台每次都要登录" 的根因）。 */
  const c = await cookies();
  const raw = c.get(sessionCookieName())?.value;
  let initialMe = null;

  if (raw) {
    const session = verifySession(raw);
    if (session) {
      const user = findById(session.userId);
      if (
        user &&
        !user.disabled &&
        user.sessionVersion === session.sessionVersion
      ) {
        initialMe = toPublic(user);
      }
    }
  }

  /* AdminApp 自己管 layout：未登录走 <main className="acct-page">（暗色 + 顶 padding），
     已登录走 <main className="shell shellMain">（暗色 + 顶 padding）。两边都用 main 元素，
     嵌套合法、视觉一致。 */
  return <AdminApp initialMe={initialMe} />;
}
