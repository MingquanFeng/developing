import Image from "next/image";
import { story } from "@/lib/data";
import styles from "./Story.module.css";

/** 重点故事：满屏肖像 + 斜体英文副标 + 阅读入口 + 四栏元信息 */
export default function Story() {
  return (
    <section className={styles.story} id="story">
      <div className={styles.media}>
        <Image
          src={story.image}
          alt={story.imageAlt}
          fill
          sizes="100vw"
          className={styles.img}
        />
        <div className={styles.scrim} />
      </div>

      <div className={styles.content}>
        <span className="tag">{story.tag}</span>

        <h2 className={styles.title}>
          <span className={styles.titleMain}>{story.titleMain}</span>
          <span className={styles.titleSub}>{story.titleSub}</span>
        </h2>

        <div className={styles.copy}>
          <p>{story.copy}</p>
        </div>

        <div className={styles.cta}>
          <a href={story.cta.href} className="btn btn--ghost">
            <span className="btn__label">{story.cta.label}</span>
            <span className="btn__arrow">→</span>
          </a>
          <span className={styles.caption}>{story.caption}</span>
        </div>
      </div>

      <div className={styles.meta}>
        {story.meta.map((m) => (
          <div key={m.label} className={styles.metaCol}>
            <span className="kicker kicker--light">{m.label}</span>
            <span className={styles.metaVal}>{m.value}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
