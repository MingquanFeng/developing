"use client";
import { footer as footerData } from "@/lib/data";
import Reveal from "./Reveal";
import styles from "./Footer.module.css";

type Line = string | { text: string; href: string };

/** 页尾：摄影师名 / 联系方式 / 社交 / 订阅入口 / 回到顶部
 *
 * 数据来源：FooterSection 透传 footer（来自 listHomeContent() 异步
 * 拉取）；site.name 同样可后台化。不传 data 时 fallback 到 lib/data
 * 静态值。
 */
export default function Footer({
  data = footerData,
  siteName,
}: {
  data?: typeof footerData;
  /** 站点名（brand）。缺省时用静态 site.name。 */
  siteName?: string;
}) {
  return (
    <footer className={styles.foot} id="contact">
      <Reveal>
        <div className={styles.top}>
          <h2 className={styles.brand}>{siteName ?? "塞上空许"}</h2>
          <p className={styles.line}>{data.line}</p>
        </div>
      </Reveal>

      <Reveal>
        <div className={styles.grid}>
          {data.columns.map((col) => (
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
        <span>{data.bottom[0]}</span>
        <span>{data.bottom[1]}</span>
        <button
          type="button"
          className={styles.backTop}
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        >
          {data.bottom[2]}
        </button>
      </div>
    </footer>
  );
}