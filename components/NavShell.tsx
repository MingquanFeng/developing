"use client";

/**
 * NavShell —— Nav 的纯客户端动画层
 * ------------------------------------------------------------------
 * 负责：滚动位置（shrunk / 索引计数）、drawer 开关与锁定滚动。
 * 不负责：登录态 —— 登录态从 server 端通过 props 传入，**这里不再探活**。
 *
 * 为什么不探活：
 * 1. 旧版 Nav 在 client 端 fetch /api/session，但 server 端 SSR 拿不到 me
 *    → 首屏 HTML 渲染"登录 / 注册"，client hydrate 后才切换 — 有闪烁
 * 2. dev 模式 HMR 编译慢时 /api/session 偶发 Failed to fetch — 误把已登录态
 *    覆盖为 null
 * 3. 切换到 server-rendered 之后，me 跟 cookie 永远一致；无需再探活
 */
import { useEffect, useState } from "react";
import { site, SECTION_IDS } from "@/lib/data";
import type { PublicUser } from "@/lib/album-client";
import styles from "./Nav.module.css";

/* 移动端断点与 .module.css @media 对齐 */
const MOBILE_BREAKPOINT = 1100;

export type NavShellProps = {
  me: PublicUser | null;
};

export default function NavShell({ me }: NavShellProps) {
  const [shrunk, setShrunk] = useState(false);
  const [index, setIndex] = useState(1);
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

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = (e: MediaQueryListEvent) => {
      if (!e.matches) setDrawerOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.style.overflow = drawerOpen ? "hidden" : "";
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, [drawerOpen]);

  const pad = (n: number) => String(n).padStart(2, "0");

  /* 关闭抽屉（点击链接 / 登出后） */
  const closeDrawer = () => setDrawerOpen(false);

  /* 已登录态的"个人空间"链接 —— 主菜单中替代"登录/注册"。
     /account 是已登录用户的账户中心；admin-only 用户额外显示 /admin。
     退出按钮放在抽屉里（移动端可见）+ 桌面 nav__auth（右上角）。 */
  const authHref = me ? (me.role === "admin" ? "/admin" : "/account") : null;
  const authLabel = me
    ? me.role === "admin"
      ? "后台"
      : "个人空间"
    : null;

  return (
    <header className={`${styles.nav} ${shrunk ? styles["is-shrunk"] : ""}`}>
      <div className={styles.nav__left}>
        <a href="/" className={styles.nav__brand} onClick={closeDrawer}>
          {site.name}
        </a>
      </div>

      {/* desktop 中部菜单 —— < 1100px 时 CSS 隐藏 */}
      <nav className={styles.nav__menu}>
        {/* 作品 / 故事 / 手记 / 关于 / 相册 / 联系 —— 永远在 */}
        <a href="#works">作品</a>
        <a href="#story">故事</a>
        <a href="#journal">手记</a>
        <a href="#about">关于</a>
        <a href="/album/">相册</a>
        <a href="#contact">联系</a>

        <span className={styles.nav__auth}>
          {me ? (
            <>
              {authHref && (
                <a href={authHref} onClick={closeDrawer}>
                  {authLabel}
                </a>
              )}
              <a href="/account" onClick={closeDrawer}>
                账户
              </a>
              <LogoutButton />
            </>
          ) : (
            <>
              <a href="/admin/" onClick={closeDrawer}>
                登录
              </a>
              <a href="/register/" onClick={closeDrawer}>
                注册
              </a>
            </>
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

      {/* 移动端抽屉 */}
      <div
        className={`${styles.nav__drawer} ${drawerOpen ? styles["nav__drawer--open"] : ""}`}
        aria-hidden={!drawerOpen}
      >
        <nav
          className={styles.nav__drawerPanel}
          onClick={(e) => {
            if (e.target === e.currentTarget) setDrawerOpen(false);
          }}
        >
          <ul className={styles.nav__drawerList}>
            <li><a href="#works" onClick={closeDrawer}>作品</a></li>
            <li><a href="#story" onClick={closeDrawer}>故事</a></li>
            <li><a href="#journal" onClick={closeDrawer}>手记</a></li>
            <li><a href="#about" onClick={closeDrawer}>关于</a></li>
            <li><a href="/album/" onClick={closeDrawer}>相册</a></li>
            <li><a href="#contact" onClick={closeDrawer}>联系</a></li>
            <li className={styles.nav__drawerSep} />
            {me ? (
              <>
                {authHref && (
                  <li>
                    <a href={authHref} onClick={closeDrawer}>{authLabel}</a>
                  </li>
                )}
                <li>
                  <a href="/account" onClick={closeDrawer}>账户</a>
                </li>
                <li>
                  <LogoutButton onAfter={closeDrawer} />
                </li>
              </>
            ) : (
              <>
                <li>
                  <a href="/admin/" onClick={closeDrawer}>登录</a>
                </li>
                <li>
                  <a href="/register/" onClick={closeDrawer}>注册</a>
                </li>
              </>
            )}
          </ul>
        </nav>
      </div>
    </header>
  );
}

/* ============================================================
   LogoutButton —— 抽出来仅为让 onClick 处理（drawer / desktop）共用
   ============================================================ */
function LogoutButton({ onAfter }: { onAfter?: () => void }) {
  return (
    <button
      type="button"
      onClick={() => {
        if (onAfter) onAfter();
        fetch(`/api/logout`, {
          method: "POST",
          credentials: "same-origin",
        })
          .catch(() => {})
          .finally(() => {
            window.location.reload();
          });
      }}
    >
      退出
    </button>
  );
}
