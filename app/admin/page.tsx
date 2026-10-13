import type { Metadata } from "next";
import AdminApp from "@/components/admin/AdminApp";

export const metadata: Metadata = {
  title: "相册后台",
  // 后台页没有对外展示价值，别进搜索索引
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  /* AdminApp 自己管 layout：未登录走 <main className="acct-page">（暗色 + 顶 padding），
     已登录走 <main className="sh">（暗色 + 顶 padding）。两边都用 main 元素，
     嵌套合法、视觉一致。 */
  return <AdminApp />;
}
