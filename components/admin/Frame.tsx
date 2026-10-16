"use client";

/**
 * Frame / Block —— 后台界面极简的视觉容器
 * ------------------------------------------------------------------
 * Frame: 后台 .sh 一类的整体外壳（背景色 + 垂直 padding + 居中）
 * Block: 单个分组（标题 + 虚线边框）
 *
 * 没有数据，纯展示组件，便于单测与复用。
 */
import styles from "./admin.module.css";

export function Frame({ children }: { children: React.ReactNode }) {
  return <div className="sh">{children}</div>;
}

export function Block({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className={styles.block}>
      <h2 className={styles.blockTitle}>{title}</h2>
      <div>{children}</div>
    </section>
  );
}
