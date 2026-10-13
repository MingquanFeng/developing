"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { series as defaultSeries, worksIntro, FALLBACK_IMAGES } from "@/lib/data";
import Reveal from "./Reveal";
import styles from "./Works.module.css";
import frameStyles from "./Frame.module.css";

/* series 一项的最小类型（涵盖默认导入 + props 传过来的两种） */
type SeriesItem = (typeof defaultSeries)[number];

/* ============================================================
   Frame —— 单图槽位
   旧图 scaleY(1→0) 自顶向上收缩；新图 scaleY(0→1) 自顶向下展开
   ============================================================ */
function Frame({
  activeKey,
  leavingKey,
  entering,
  series,
}: {
  activeKey: string;
  leavingKey: string | null;
  entering: boolean;
  series: readonly SeriesItem[];
}) {
  const activeIndex = Math.max(series.findIndex((s) => s.key === activeKey), 0);

  const imgClass = (key: string) => {
    let cls = frameStyles.img;
    if (key === leavingKey) cls += ` ${frameStyles.imgLeaving}`;
    else if (key === activeKey && entering) cls += ` ${frameStyles.imgEntering}`;
    return cls;
  };

  return (
    <div className={frameStyles.frame} id="frame">
      <div className={frameStyles.stack}>
        {series.map((s) => {
          /* 切换过程中，旧图仍需保持可见以播完收缩动画 */
          const visible = s.key === activeKey || s.key === leavingKey;
          return (
            <figure
              key={s.key}
              className={`${frameStyles.slide} ${
                visible ? frameStyles.slideCurrent : ""
              }`}
            >
              <img
                src={s.image}
                alt={s.imageAlt}
                className={imgClass(s.key)}
              />
              <figcaption className={frameStyles.caption}>
                <span>{s.figLabel}</span>
                <span>{s.figCaption}</span>
              </figcaption>
            </figure>
          );
        })}
      </div>

      <div className={frameStyles.rail}>
        <span>
          {String(activeIndex + 1).padStart(2, "0")} /{" "}
          {String(series.length).padStart(2, "0")}
        </span>
        <span className={frameStyles.railSep} />
        <span>{worksIntro.frameHint}</span>
      </div>
    </div>
  );
}

/* ============================================================
   Works —— 文字主导的系列目录
   持有 activeKey，hover / focus / click 驱动右侧单图切换
   ============================================================ */
export default function Works({
  series = defaultSeries,
}: {
  series?: readonly SeriesItem[];
} = {}) {
  const [activeKey, setActiveKey] = useState<string>(series[0].key);
  const [leavingKey, setLeavingKey] = useState<string | null>(null);
  const [entering, setEntering] = useState(false);

  const prevKey = useRef<string>(series[0].key);
  const lock = useRef(false);
  const timers = useRef<number[]>([]);

  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };

  const switchTo = useCallback((key: string) => {
    if (lock.current || key === prevKey.current) return;
    lock.current = true;
    clearTimers();

    setLeavingKey(prevKey.current);
    setEntering(false);
    setActiveKey(key);
    prevKey.current = key;

    /* 新图延后 220ms 展开，与旧图收缩错开 */
    const t1 = window.setTimeout(() => {
      setEntering(true);
      const t2 = window.setTimeout(() => {
        setLeavingKey(null);
        setEntering(false);
        lock.current = false;
      }, 900);
      timers.current.push(t2);
    }, 220);
    timers.current.push(t1);
  }, []);

  useEffect(() => clearTimers, []);

  return (
    <section className={styles.works} id="works">
      <Reveal>
        <div className={styles.head}>
          <h2 className={styles.title}>
            {worksIntro.titleLines.map((l) => (
              <em key={l}>{l}</em>
            ))}
            <span className={styles.titleSuffix}>{worksIntro.titleSuffix}</span>
          </h2>
          <div className={styles.side}>
            <span className="kicker">{worksIntro.kicker}</span>
            <p>{worksIntro.intro}</p>
          </div>
        </div>
      </Reveal>

      <div className={styles.layout}>
        <ol className={styles.catalog}>
          {series.map((s) => (
            <li
              key={s.key}
              className={`${styles.item} ${
                s.key === activeKey ? styles.itemActive : ""
              }`}
              tabIndex={0}
              onMouseEnter={() => switchTo(s.key)}
              onFocus={() => switchTo(s.key)}
              onClick={() => switchTo(s.key)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  switchTo(s.key);
                }
              }}
            >
              <span className={styles.no}>{s.no}</span>
              <div>
                <h3 className={styles.name}>{s.name}</h3>
                <p className={styles.meta}>{s.meta}</p>
                <p className={styles.note}>{s.note}</p>
              </div>
              <span className={styles.arrow}>→</span>
            </li>
          ))}
        </ol>

        <Frame
          series={series}
          activeKey={activeKey}
          leavingKey={leavingKey}
          entering={entering}
        />
      </div>
    </section>
  );
}

/* 全局委托：图片 onerror 兜底（避免每张 img 都挂 handler） */
export function ImageFallbackProvider() {
  useEffect(() => {
    const handler = (e: Event) => {
      const el = e.target as HTMLImageElement;
      if (!(el instanceof HTMLImageElement)) return;
      if (el.dataset.fallbackDone) return;
      el.dataset.fallbackDone = "1";
      const idx = defaultSeries.findIndex((s) => s.imageAlt === el.alt);
      const fb = FALLBACK_IMAGES[(idx + 1) % FALLBACK_IMAGES.length];
      el.src = `${fb}?w=1600&q=80&auto=format&fit=crop`;
    };
    document.addEventListener("error", handler, true);
    return () => document.removeEventListener("error", handler, true);
  }, []);
  return null;
}
