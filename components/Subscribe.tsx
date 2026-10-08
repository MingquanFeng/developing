"use client";

import { useState, type FormEvent } from "react";
import { subscribe } from "@/lib/data";
import Reveal from "./Reveal";
import styles from "./Subscribe.module.css";

/** 订阅区：一年四封信的 newsletter 入口 */
export default function Subscribe() {
  const [done, setDone] = useState(false);

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setDone(true);
  };

  return (
    <section className={styles.subscribe}>
      <Reveal>
        <div className={styles.inner}>
          <span className="kicker kicker--dark">{subscribe.kicker}</span>

          <h2 className={styles.title}>
            {subscribe.titleLines.map((l) => (
              <span key={l}>{l}</span>
            ))}
          </h2>

          <p className={styles.copy}>{subscribe.copy}</p>

          <form className={styles.form} onSubmit={onSubmit}>
            <input
              type="email"
              placeholder={subscribe.placeholder}
              required
              aria-label="邮箱地址"
            />
            <button type="submit">{subscribe.button}</button>
            <span className={`${styles.ok} ${done ? styles.okOn : ""}`}>
              {subscribe.success}
            </span>
          </form>
        </div>
      </Reveal>
    </section>
  );
}
