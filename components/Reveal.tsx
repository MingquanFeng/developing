"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * 滚动揭示包装器 —— 取代原 script.js 里的 IntersectionObserver
 * 进入视口时加上 .is-in，触发 CSS 里的 opacity / translateY 过渡
 */
export default function Reveal({
  children,
  className = "",
  threshold = 0.12,
}: {
  children: ReactNode;
  className?: string;
  threshold?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("is-in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold, rootMargin: "0px 0px -8% 0px" },
    );

    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);

  return (
    <div ref={ref} className={`reveal ${className}`.trim()}>
      {children}
    </div>
  );
}
