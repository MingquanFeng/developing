"use client";

import { useEffect, useRef, type ReactNode } from "react";
import styles from "./Interlude.module.css";

/** 逐行遮罩揭幕（每行 translateY 从 110% 滑入） */
function QuoteLines({
  lines,
  emphasisIndex = -1,
  small,
}: {
  lines: readonly string[];
  emphasisIndex?: number;
  small?: boolean;
}) {
  const ref = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const targets = Array.from(
      root.querySelectorAll<HTMLElement>(`.${styles.quoteLine}`),
    );

    /* 兜底：mount 0.5s 后无论 IO 触发与否都 reveal，避免 hydration 时元素已经在
       视口里 IO 漏触发（threshold 0.18 不满足）导致文字永久 translateY(110%)
       —— 之前就是这个 bug 让「手记 01 / 关于面孔」完全看不见。 */
    const fallback = window.setTimeout(() => {
      targets.forEach((t) => t.classList.add(styles.isIn));
    }, 500);

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add(styles.isIn);
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.18 },
    );

    targets.forEach((t) => io.observe(t));
    return () => {
      clearTimeout(fallback);
      io.disconnect();
    };
  }, [lines]);

  return (
    <p
      ref={ref}
      className={`${styles.quote} ${small ? styles["quote--small"] : ""}`}
    >
      {lines.map((line, i) => (
        <span key={line + i} className={styles.quoteLine}>
          <span>
            {i === emphasisIndex ? <em>{line}</em> : line}
          </span>
        </span>
      ))}
    </p>
  );
}

/* ============================================================
   Interlude —— 文字间奏
   variant: "plain" | "dark" | "minimal"
   ============================================================ */
export default function Interlude({
  id,
  kicker,
  lines,
  sig,
  emphasisIndex,
  variant = "plain",
  small,
  children,
}: {
  id?: string;
  kicker: string;
  lines?: readonly string[];
  sig?: string;
  emphasisIndex?: number;
  variant?: "plain" | "dark" | "minimal";
  small?: boolean;
  children?: ReactNode;
}) {
  const variantClass =
    variant === "dark"
      ? styles["interlude--dark"]
      : variant === "minimal"
        ? styles["interlude--minimal"]
        : "";

  return (
    <section id={id} className={`${styles.interlude} ${variantClass}`}>
      <div className={`${styles.inner} ${children ? styles["inner--wide"] : ""}`}>
        <span
          className={`kicker ${
            variant === "dark" ? "kicker--light" : "kicker--dark"
          }`}
        >
          {kicker}
        </span>

        {lines && (
          <QuoteLines
            lines={lines}
            emphasisIndex={emphasisIndex}
            small={small}
          />
        )}

        {children}

        {sig && <div className={styles.sig}>{sig}</div>}
      </div>
    </section>
  );
}

export { QuoteLines };
