import Image from "next/image";
import { hero } from "@/lib/data";
import styles from "./Hero.module.css";

/** 首屏：满屏肖像 + 超大标题 + 查看作品按钮 + 底部四栏元信息 */
export default function Hero() {
  return (
    <section className={styles.hero} id="hero">
      <div className={styles.media}>
        <Image
          src={hero.image}
          alt={hero.imageAlt}
          fill
          priority
          sizes="100vw"
          className={styles.img}
        />
        <div className={styles.scrim} />
      </div>

      <div className={styles.content}>
        <div className={styles.top}>
          {hero.tags.map((t) => (
            <span key={t} className="tag">
              {t}
            </span>
          ))}
        </div>

        <h1 className={styles.title}>
          {hero.titleLines.map((line) => (
            <span key={line} className={styles.titleMask}>
              <span>{line}</span>
            </span>
          ))}
        </h1>

        <div className={styles.sub}>
          <p>{hero.sub}</p>
        </div>

        <div className={styles.cta}>
          <a href={hero.cta.href} className="btn">
            <span className="btn__label">{hero.cta.label}</span>
            <span className="btn__arrow">↓</span>
          </a>
          <span className={styles.caption}>{hero.caption}</span>
        </div>
      </div>

      <div className={styles.meta}>
        {hero.meta.map((m) => (
          <div key={m.label} className={styles.metaCol}>
            <span className="kicker">{m.label}</span>
            <span className={styles.metaVal}>{m.value}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
