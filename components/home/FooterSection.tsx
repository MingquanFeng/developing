/**
 * 第 09 幕 —— 页尾（FOOTER）
 * ------------------------------------------------------------------
 * 最深冷黑，三栏：工作室 / 代理 / 社交。id="contact" 作为邮件订阅锚点。
 * 视觉上是 footer 元素、DOM 上是 main 的兄弟节点（page.tsx 编排）。
 *
 * 数据来源：`app/page.tsx` 通过 listHomeContent() 异步拉取。本组件
 * 只负责透传 —— 不直接 import lib/data。
 */
import Footer from "@/components/Footer";
import type { footer } from "@/lib/data/footer";

export default function FooterSection({ data }: { data: typeof footer }) {
  return <Footer data={data} />;
}