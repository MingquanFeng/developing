import Image from "next/image";
import { hero as heroData } from "@/lib/data/home";
import styles from "./Hero.module.css";

/** 首屏：满屏肖像 + 超大标题 + 查看作品按钮 + 底部四栏元信息
 *
 * 数据来源：HeroSection 透传（来自 listHomeContent() 异步拉取）。
 * 不传 data 时 fallback 到 lib/data 静态 hero（向后兼容单测/Storybook）。
 */
export default function Hero({ data = heroData }: { data?: typeof heroData }) {
  return (
    <section className={styles.hero} id="hero">
      <div className={styles.media}>
        <Image
          src={data.image}
          alt={data.imageAlt}
          fill
          priority
          sizes="100vw"
          className={styles.img}
        />
        <div className={styles.scrim} />
      </div>

      <div className={styles.content}>
        <div className={styles.top}>
          {data.tags.map((t) => (
            <span key={t} className="tag">
              {t}
            </span>
          ))}
        </div>

        <h1 className={styles.title}>
          {data.titleLines.map((line) => (
            <span key={line} className={styles.titleMask}>
              <span>{line}</span>
            </span>
          ))}
        </h1>

        <div className={styles.sub}>
          <p>{data.sub}</p>
        </div>

        <div className={styles.cta}>
          <a href={data.cta.href} className="btn">
            <span className="btn__label">{data.cta.label}</span>
            <span className="btn__arrow">↓</span>
          </a>
          <span className={styles.caption}>{data.caption}</span>
        </div>
      </div>

      <div className={styles.meta}>
        {data.meta.map((m) => (
          <div key={m.label} className={styles.metaCol}>
            <span className="kicker">{m.label}</span>
            <span className={styles.metaVal}>{m.value}</span>
          </div>
        ))}
      </div>
    </section>
  );
}