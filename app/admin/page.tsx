import type { Metadata } from "next";
import AdminApp from "@/components/admin/AdminApp";

export const metadata: Metadata = {
  title: "相册后台",
  // 后台页没有对外展示价值，别进搜索索引
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return (
    <>
      <main style={{ background: "var(--bg)", color: "var(--ink)" }}>
        <AdminApp />
      </main>
    </>
  );
}