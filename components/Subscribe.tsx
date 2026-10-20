"use client";
import { useState, type FormEvent } from "react";
import { subscribe as subscribeData } from "@/lib/data/subscribe";
import Reveal from "./Reveal";
import styles from "./Subscribe.module.css";

/** 订阅区：一年四封信的 newsletter 入口
 *
 * 数据来源：SubscribeSection 透传（来自 listHomeContent() 异步拉取）。
 * 不传 data 时 fallback 到 lib/data 静态 subscribe。
 */
export default function Subscribe({
  data = subscribeData,
}: {
  data?: typeof subscribeData;
}) {
  const [done, setDone] = useState(false);

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setDone(true);
  };

  return (
    <section className={styles.subscribe}>
      <Reveal>
        <div className={styles.inner}>
          <span className="kicker kicker--dark">{data.kicker}</span>

          <h2 className={styles.title}>
            {data.titleLines.map((l) => (
              <span key={l}>{l}</span>
            ))}
          </h2>

          <p className={styles.copy}>{data.copy}</p>

          <form className={styles.form} onSubmit={onSubmit}>
            <input
              type="email"
              placeholder={data.placeholder}
              required
              aria-label="邮箱地址"
            />
            <button type="submit">{data.button}</button>
            <span className={`${styles.ok} ${done ? styles.okOn : ""}`}>
              {data.success}
            </span>
          </form>
        </div>
      </Reveal>
    </section>
  );
}