"use client";

import { footer, site } from "@/lib/data";
import Reveal from "./Reveal";
import styles from "./Footer.module.css";

type Line = string | { text: string; href: string };

/** 页尾：摄影师名 / 联系方式 / 社交 / 订阅入口 / 回到顶部 */
export default function Footer() {
  return (
    <footer className={styles.foot} id="contact">
      <Reveal>
        <div className={styles.top}>
          <h2 className={styles.brand}>{site.name}</h2>
          <p className={styles.line}>{footer.line}</p>
        </div>
      </Reveal>

      <Reveal>
        <div className={styles.grid}>
          {footer.columns.map((col) => (
            <div key={col.kicker} className={styles.col}>
              <span className="kicker">{col.kicker}</span>
              <p>
                {col.lines.map((l: Line, i) =>
                  typeof l === "string" ? (
                    <span key={i}>
                      {l}
                      <br />
                    </span>
                  ) : (
                    <span key={i}>
                      <a href={l.href}>{l.text}</a>
                      <br />
                    </span>
                  ),
                )}
              </p>
            </div>
          ))}
        </div>
      </Reveal>

      <div className={styles.bot}>
        <span>{footer.bottom[0]}</span>
        <span>{footer.bottom[1]}</span>
        <button
          type="button"
          className={styles.backTop}
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        >
          {footer.bottom[2]}
        </button>
      </div>
    </footer>
  );
}
