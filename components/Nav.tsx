"use client";

import { useEffect, useState } from "react";
import { nav, site, SECTION_IDS } from "@/lib/data";
import type { PublicUser } from "@/lib/album-client";
import styles from "./Nav.module.css";

/** 账户入口在导航里单独分组，靠 /admin/ 与 /register/ 前缀识别 */
const isAuth = (href: string) =>
  href.startsWith("/admin/") || href.startsWith("/register/");

/* 移动端断点与 .module.css @media 对齐 */
const MOBILE_BREAKPOINT = 1100;

export default function Nav() {
  const [shrunk, setShrunk] = useState(false);
  const [index, setIndex] = useState(1);
  const [me, setMe] = useState<PublicUser | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

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

  /* 探活：同源 `/api/session`，cookies 自动带。 */
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

  /* 视口变化时关掉 drawer：避免在 > 1100px 时还残留打开状态 */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = (e: MediaQueryListEvent) => {
      if (!e.matches) setDrawerOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  /* drawer 打开时锁滚动；关闭时恢复 */
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.style.overflow = drawerOpen ? "hidden" : "";
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, [drawerOpen]);

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
        setDrawerOpen(false);
      }}
    >
      {item.label}
    </a>
  );

  const renderAuthItem = (item: (typeof nav)[number]) =>
    renderItem(item);

  const mainItems = nav.filter((item) => !isAuth(item.href));
  const authItems = nav.filter((item) => isAuth(item.href));

  const onLogout = () => {
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
        <a href="/" className={styles.nav__brand} onClick={() => setDrawerOpen(false)}>
          {site.name}
        </a>
      </div>

      {/* desktop 中部菜单 —— < 1100px 时 CSS 隐藏 */}
      <nav className={styles.nav__menu}>
        {mainItems.map(renderItem)}
        <span className={styles.nav__auth}>
          {me ? (
            <>
              {me.role === "admin" && (
                <a href="/admin" onClick={() => setDrawerOpen(false)}>
                  后台
                </a>
              )}
              <a href="/account" onClick={() => setDrawerOpen(false)}>
                账户
              </a>
              <button type="button" onClick={onLogout}>
                退出
              </button>
            </>
          ) : (
            authItems.map(renderAuthItem)
          )}
        </span>
      </nav>

      <div className={styles.nav__right}>
        <span className={styles.nav__index}>
          {pad(index)} / {pad(SECTION_IDS.length)}
        </span>
        {/* 汉堡按钮 —— 移动端显示 */}
        <button
          type="button"
          aria-label={drawerOpen ? "关闭菜单" : "打开菜单"}
          aria-expanded={drawerOpen}
          className={`${styles.nav__burger} ${drawerOpen ? styles["nav__burger--open"] : ""}`}
          onClick={() => setDrawerOpen((v) => !v)}
        >
          <span />
          <span />
          <span />
        </button>
      </div>

      {/* 移动端抽屉 —— backdrop + 抽屉面板 */}
      <div
        className={`${styles.nav__drawer} ${drawerOpen ? styles["nav__drawer--open"] : ""}`}
        aria-hidden={!drawerOpen}
      >
        <nav
          className={styles.nav__drawerPanel}
          onClick={(e) => {
            /* 链接本身有 onClick 关闭，背景点击关闭 */
            if (e.target === e.currentTarget) setDrawerOpen(false);
          }}
        >
          <ul className={styles.nav__drawerList}>
            {mainItems.map((item) => (
              <li key={item.href}>{renderItem(item)}</li>
            ))}
            <li className={styles.nav__drawerSep} />
            {me ? (
              <>
                <li>
                  <a href="/account" onClick={() => setDrawerOpen(false)}>
                    账户
                  </a>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      setDrawerOpen(false);
                      onLogout();
                    }}
                  >
                    退出
                  </button>
                </li>
              </>
            ) : (
              authItems.map((item) => (
                <li key={item.href}>{renderAuthItem(item)}</li>
              ))
            )}
          </ul>
        </nav>
      </div>
    </header>
  );
}
