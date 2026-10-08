import Image from "next/image";
import { about } from "@/lib/data";
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

/** 摄影师介绍：双栏，克制人像 + 创作理念与经历 */
export default function About() {
  return (
    <section className={styles.about} id="about">
      <div className={styles.grid}>
        <Reveal className={styles.media}>
          <div className={styles.frame}>
            <Image
              src={about.portrait}
              alt={about.portraitAlt}
              fill
              sizes="(max-width: 1100px) 480px, 40vw"
              style={{ objectFit: "cover" }}
            />
          </div>
          <div className={styles.cap}>
            <span className="kicker kicker--dark">— 自拍像</span>
            <p>{about.portraitCap}</p>
          </div>
        </Reveal>

        <Reveal className={styles.body}>
          <span className="kicker kicker--dark">{about.kicker}</span>

          <h2 className={styles.title}>
            {about.titleLines.map((l, i) =>
              i === about.titleEmphasisIndex ? (
                <em key={l}>{l}</em>
              ) : (
                <span key={l}>{l}</span>
              ),
            )}
          </h2>

          <p className={styles.lede}>
            {about.ledeTop}
            <span className={styles.hl}>{about.ledeHighlight}</span>。
          </p>

          <div className={styles.cols}>
            <ListBlock kicker="— 代表个展" items={about.exhibitions} />
            <ListBlock kicker="— 代表出版" items={about.press} />
          </div>

          <div className={styles.cta}>
            <a href={about.cta.href} className="btn btn--ink">
              <span className="btn__label">{about.cta.label}</span>
              <span className="btn__arrow">→</span>
            </a>
            <a href="#" className={styles.linkLine}>
              {about.ctaSecondary}
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
