/**
 * 第 08 幕 —— 通讯订阅（SUBSCRIBE）
 * ------------------------------------------------------------------
 * 浅纸色 + newsletter 表单。提交后切换文案"已收到"——
 * 客户端 form 故 Subscribe 本身是 use client，本节只是 server 包裹。
 *
 * 数据来源：`app/page.tsx` 通过 listHomeContent() 异步拉取。本组件
 * 只负责透传 —— 不直接 import lib/data。
 */
import Subscribe from "@/components/Subscribe";
import type { subscribe } from "@/lib/data/subscribe";

export default function SubscribeSection({
  data,
}: {
  data: typeof subscribe;
}) {
  return <Subscribe data={data} />;
}