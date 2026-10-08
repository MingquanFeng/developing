"use client";

import { useEffect, useState } from "react";
import { nav, site, SECTION_IDS } from "@/lib/data";
import styles from "./Nav.module.css";

/** 固定导航：滚动收缩 + 当前章节索引 */
export default function Nav() {
  const [shrunk, setShrunk] = useState(false);
  const [index, setIndex] = useState(1);

  useEffect(() => {
    const onScroll = () => {
      setShrunk(window.scrollY > 80);

      const mid = window.scrollY + window.innerHeight * 0.4;
      let idx = 1;
      SECTION_IDS.forEach((id, i) => {
        const el = document.getElementById(id);
        if (el && el.offsetTop <= mid) idx = i + 1;
      });
      setIndex(Math.min(idx, SECTION_IDS.length));
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <header className={`${styles.nav} ${shrunk ? styles.is_shrunk : ""}`}>
      <div className={styles.nav__left}>
        <a href="#hero" className={styles.nav__brand}>
          {site.name}
        </a>
      </div>

      <nav className={styles.nav__menu}>
        {nav.map((item) => (
          <a
            key={item.href}
            href={item.href}
            onClick={(e) => {
              /* 站内锚点走平滑滚动；跨页链接（如 /album/）交给浏览器 */
              if (!item.href.startsWith("#")) return;
              e.preventDefault();
              document
                .getElementById(item.href.slice(1))
                ?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          >
            {item.label}
          </a>
        ))}
      </nav>

      <div className={styles.nav__right}>
        <span className={styles.nav__index}>
          {pad(index)} / {pad(SECTION_IDS.length)}
        </span>
      </div>
    </header>
  );
}
