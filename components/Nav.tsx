"use client";

import { useEffect, useState } from "react";
import { nav, site, SECTION_IDS } from "@/lib/data";
import type { PublicUser } from "@/lib/album-client";
import styles from "./Nav.module.css";

/** 账户入口在导航里单独分组，靠 /admin/ 与 /register/ 前缀识别 */
const isAuth = (href: string) =>
  href.startsWith("/admin/") || href.startsWith("/register/");

/**
 * 固定导航：滚动收缩 + 当前章节索引 + 登录态感知。
 *
 * 登录态由 useEffect 探活一次决定：
 *   - me === null（初始 / 探活中 / 探到未登录 / 接口异常）：
 *     渲染 nav 里的 authItems（"登录 / 注册"），与原静态行为一致
 *   - me !== null：渲染"账户 + 退出"按钮组
 *
 * 探测"悄悄"做：没有 loading 骨架，UI 不闪——首次渲染就当未登录。
 */
export default function Nav() {
  const [shrunk, setShrunk] = useState(false);
  const [index, setIndex] = useState(1);
  const [me, setMe] = useState<PublicUser | null>(null);

  useEffect(() => {
    const onScroll = () => {
      setShrunk(window.scrollY > 80);

      const mid = window.scrollY + window.innerHeight * 0.4;
      let idx = 1;
      SECTION_IDS.forEach((id, i) => {
        const el = document.getElementById(id);
        if (el && el.offsetTop <= mid) idx = i + 1;
      });
      setIndex(Math.min(idx, SECTION_IDS.length));
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* 探活：同源 `/api/session`，cookies 自动带。Nav 不需要 base URL。 */
  useEffect(() => {
    let cancelled = false;

    fetch(`/api/session`, { credentials: "same-origin" })
      .then(async (r) => {
        if (!r.ok) return null;
        return (await r.json()) as { user?: PublicUser };
      })
      .then((data) => {
        if (cancelled) return;
        setMe(data?.user ?? null);
      })
      .catch(() => {
        if (cancelled) return;
        setMe(null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const pad = (n: number) => String(n).padStart(2, "0");

  const renderItem = (item: (typeof nav)[number]) => (
    <a
      key={item.href}
      href={item.href}
      onClick={(e) => {
        /* 站内锚点走平滑滚动；跨页链接（如 /album/）交给浏览器 */
        if (!item.href.startsWith("#")) return;
        e.preventDefault();
        document
          .getElementById(item.href.slice(1))
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }}
    >
      {item.label}
    </a>
  );

  const mainItems = nav.filter((item) => !isAuth(item.href));
  const authItems = nav.filter((item) => isAuth(item.href));

  const onLogout = () => {
    /* logout 不管成败都 reload：让全站按"未登录"重新探活 + 重新拉清单 */
    fetch(`/api/logout`, {
      method: "POST",
      credentials: "same-origin",
    })
      .catch(() => {})
      .finally(() => {
        window.location.reload();
      });
  };

  return (
    <header className={`${styles.nav} ${shrunk ? styles["is-shrunk"] : ""}`}>
      <div className={styles.nav__left}>
        <a href="#hero" className={styles.nav__brand}>
          {site.name}
        </a>
      </div>

      <nav className={styles.nav__menu}>
        {mainItems.map(renderItem)}
        <span className={styles.nav__auth}>
          {me ? (
            <>
              <a href="/account/">账户</a>
              <button type="button" onClick={onLogout}>
                退出
              </button>
            </>
          ) : (
            authItems.map(renderItem)
          )}
        </span>
      </nav>

      <div className={styles.nav__right}>
        <span className={styles.nav__index}>
          {pad(index)} / {pad(SECTION_IDS.length)}
        </span>
      </div>
    </header>
  );
}
