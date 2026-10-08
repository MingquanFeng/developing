import { coords } from "@/lib/data";
import Interlude, { QuoteLines } from "./Interlude";
import styles from "./Interlude.module.css";

/** 手记 02 —— 对象与坐标表（深色区块） */
export default function Coords() {
  return (
    <Interlude id="locations" kicker={coords.kicker} variant="dark">
      <div className={styles.coords}>
        {coords.rows.map((r) => (
          <div key={r.no} className={styles.coordRow}>
            <span className={styles.coordNo}>{r.no}</span>
            <span className={styles.coordPlace}>{r.place}</span>
            <span className={styles.coordA}>{r.a}</span>
            <span className={styles.coordB}>{r.b}</span>
            <span className={styles.coordTime}>{r.time}</span>
          </div>
        ))}
      </div>

      <div className={styles.sig}>{coords.sig}</div>
    </Interlude>
  );
}
