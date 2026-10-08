"use client";

import { useEffect, useState } from "react";
import { site } from "@/lib/data";
import styles from "./MetaBar.module.css";

const pad = (n: number) => String(n).padStart(2, "0");

/** 北京时间（GMT+8）实时钟 */
function beijingNow() {
  const d = new Date();
  const utc = d.getTime() + d.getTimezoneOffset() * 60_000;
  const bj = new Date(utc + 8 * 3600_000);
  return `${pad(bj.getHours())}:${pad(bj.getMinutes())}:${pad(bj.getSeconds())} 北京`;
}

export default function MetaBar() {
  const [clock, setClock] = useState("--:--:-- 北京");

  useEffect(() => {
    const tick = () => setClock(beijingNow());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className={styles.meta}>
      <span className={styles.meta__dot} />
      <span className={styles.meta__txt}>{site.marquee[0]}</span>
      <span className={styles.meta__sep}>—</span>
      <span className={styles.meta__txt}>{site.marquee[1]}</span>
      <span className={styles.meta__sep}>—</span>
      <span className={styles.meta__txt}>{clock}</span>
    </div>
  );
}
