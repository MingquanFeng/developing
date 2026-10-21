import Image from "next/image";
import { story as storyData } from "@/lib/data";
import styles from "./Story.module.css";

/** 重点故事：满屏肖像 + 斜体英文副标 + 阅读入口 + 四栏元信息
 *
 * 数据来源：StorySection 透传（来自 listHomeContent() 异步拉取）。
 * 不传 data 时 fallback 到 lib/data 静态 story。
 */
export default function Story({ data = storyData }: { data?: typeof storyData }) {
  return (
    <section className={styles.story} id="story">
      <div className={styles.media}>
        <Image
          src={data.image}
          alt={data.imageAlt}
          fill
          sizes="100vw"
          className={styles.img}
        />
        <div className={styles.scrim} />
      </div>

      <div className={styles.content}>
        <span className="tag">{data.tag}</span>

        <h2 className={styles.title}>
          <span className={styles.titleMain}>{data.titleMain}</span>
          <span className={styles.titleSub}>{data.titleSub}</span>
        </h2>

        <div className={styles.copy}>
          <p>{data.copy}</p>
        </div>

        <div className={styles.cta}>
          <a href={data.cta.href} className="btn btn--ghost">
            <span className="btn__label">{data.cta.label}</span>
            <span className="btn__arrow">→</span>
          </a>
          <span className={styles.caption}>{data.caption}</span>
        </div>
      </div>

      <div className={styles.meta}>
        {data.meta.map((m) => (
          <div key={m.label} className={styles.metaCol}>
            <span className="kicker kicker--light">{m.label}</span>
            <span className={styles.metaVal}>{m.value}</span>
          </div>
        ))}
      </div>
    </section>
  );
}