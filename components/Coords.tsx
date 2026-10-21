import { coords as coordsData } from "@/lib/data";
import Interlude, { QuoteLines } from "./Interlude";
import styles from "./Interlude.module.css";

/** 手记 02 —— 对象与坐标表（深色区块）
 *
 * 数据来源：CoordsSection 透传（来自 listHomeContent() 异步拉取）。
 * 不传 data 时 fallback 到 lib/data 静态 coords。
 */
export default function Coords({
  data = coordsData,
}: {
  data?: typeof coordsData;
}) {
  return (
    <Interlude id="locations" kicker={data.kicker} variant="dark">
      <div className={styles.coords}>
        {data.rows.map((r) => (
          <div key={r.no} className={styles.coordRow}>
            <span className={styles.coordNo}>{r.no}</span>
            <span className={styles.coordPlace}>{r.place}</span>
            <span className={styles.coordA}>{r.a}</span>
            <span className={styles.coordB}>{r.b}</span>
            <span className={styles.coordTime}>{r.time}</span>
          </div>
        ))}
      </div>

      <div className={styles.sig}>{data.sig}</div>
    </Interlude>
  );
}