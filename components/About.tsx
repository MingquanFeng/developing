import Image from "next/image";
import { about as aboutData } from "@/lib/data/about";
import Reveal from "./Reveal";
import styles from "./About.module.css";

function ListBlock({
  kicker,
  items,
}: {
  kicker: string;
  items: readonly { year: string; text: string }[];
}) {
  return (
    <div className={styles.col}>
      <span className="kicker kicker--dark">{kicker}</span>
      <ul>
        {items.map((it) => (
          <li key={it.year + it.text}>
            <span>{it.year}</span>
            <span>{it.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 摄影师介绍：双栏，克制人像 + 创作理念与经历
 *
 * 数据来源：AboutSection 透传（来自 listHomeContent() 异步拉取）。
 * 不传 data 时 fallback 到 lib/data 静态 about。
 */
export default function About({ data = aboutData }: { data?: typeof aboutData }) {
  return (
    <section className={styles.about} id="about">
      <div className={styles.grid}>
        <Reveal className={styles.media}>
          <div className={styles.frame}>
            <Image
              src={data.portrait}
              alt={data.portraitAlt}
              fill
              sizes="(max-width: 1100px) 480px, 40vw"
              style={{ objectFit: "cover" }}
            />
          </div>
          <div className={styles.cap}>
            <span className="kicker kicker--dark">— 自拍像</span>
            <p>{data.portraitCap}</p>
          </div>
        </Reveal>

        <Reveal className={styles.body}>
          <span className="kicker kicker--dark">{data.kicker}</span>

          <h2 className={styles.title}>
            {data.titleLines.map((l, i) =>
              i === data.titleEmphasisIndex ? (
                <em key={l}>{l}</em>
              ) : (
                <span key={l}>{l}</span>
              ),
            )}
          </h2>

          <p className={styles.lede}>
            {data.ledeTop}
            <span className={styles.hl}>{data.ledeHighlight}</span>。
          </p>

          <div className={styles.cols}>
            <ListBlock kicker="— 代表个展" items={data.exhibitions} />
            <ListBlock kicker="— 代表出版" items={data.press} />
          </div>

          <div className={styles.cta}>
            <a href={data.cta.href} className="btn btn--ink">
              <span className="btn__label">{data.cta.label}</span>
              <span className="btn__arrow">→</span>
            </a>
            <a href="#" className={styles.linkLine}>
              {data.ctaSecondary}
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}