"use client";

/**
 * NavShell —— Nav 的纯客户端动画层
 * ------------------------------------------------------------------
 * 负责：滚动位置（shrunk / 索引计数）、drawer 开关与锁定滚动、用户下拉。
 * 不负责：登录态 —— 登录态从 server 端通过 props 传入，**这里不再探活**。
 *
 * 为什么不探活：
 * 1. 旧版 Nav 在 client 端 fetch /api/session，但 server 端 SSR 拿不到 me
 *    → 首屏 HTML 渲染"登录 / 注册"，client hydrate 后才切换 — 有闪烁
 * 2. dev 模式 HMR 编译慢时 /api/session 偶发 Failed to fetch — 误把已登录态
 *    覆盖为 null
 * 3. 切换到 server-rendered 之后，me 跟 cookie 永远一致；无需再探活
 */
import { useEffect, useRef, useState } from "react";
import { site, SECTION_IDS } from "@/lib/data";
import type { nav } from "@/lib/data/nav";
import type { PublicUser } from "@/lib/album-client";
import { logoutSession } from "@/lib/admin-api";
import styles from "./Nav.module.css";

/* 移动端断点与 .module.css @media 对齐 */
const MOBILE_BREAKPOINT = 1100;

/** 导航项的运行时形状（DB 覆盖值可变宽） */
export type NavItem = { label: string; href: string };

export type NavShellProps = {
  me: PublicUser | null;
  /** 顶导航内容项。来源：server 端 Nav 查 DB 覆盖值（回落 lib/data/nav
   *  静态默认）。账户入口（登录/注册）不在这里 —— 按登录态程序渲染。 */
  items: readonly NavItem[];
};

export default function NavShell({ me, items }: NavShellProps) {
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
  const closeDrawer = () => setDrawerOpen(false);

  return (
    <header className={`${styles.nav} ${shrunk ? styles["is-shrunk"] : ""}`}>
      <div className={styles.nav__left}>
        <a href="/" className={styles.nav__brand} onClick={closeDrawer}>
          {site.name}
        </a>
      </div>

      {/* desktop 中部菜单 —— < 1100px 时 CSS 隐藏 */}
      <nav className={styles.nav__menu}>
        {/* 内容项（作品 / 故事 / 手记 / 关于 / 相册 / 联系 …）—— 来自
            props，后台可改文案与链接；账户入口按登录态程序渲染。 */}
        {items.map((it) => (
          <a key={`${it.label}-${it.href}`} href={it.href}>
            {it.label}
          </a>
        ))}

        {me ? (
          <UserMenu me={me} />
        ) : (
          <span className={styles.nav__auth}>
            <a href="/admin/" onClick={closeDrawer}>
              登录
            </a>
            <a href="/register/" onClick={closeDrawer}>
              注册
            </a>
          </span>
        )}
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
            {items.map((it) => (
              <li key={`${it.label}-${it.href}`}>
                <a href={it.href} onClick={closeDrawer}>
                  {it.label}
                </a>
              </li>
            ))}
            <li className={styles.nav__drawerSep} />
            {me ? (
              <>
                {me.role === "admin" ? (
                  <li>
                    <a href="/admin" onClick={closeDrawer}>相册</a>
                  </li>
                ) : (
                  <li>
                    <a href="/account" onClick={closeDrawer}>个人空间</a>
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
   UserMenu —— 桌面端已登录态下拉
   ------------------------------------------------------------
   单按钮 + 浮层菜单：
     - admin  → 后台 / 账户 / 退出
     - viewer → 个人空间 / 账户 / 退出
   移动端不渲染此组件（drawer 内已分项）。
   ============================================================ */
function UserMenu({ me }: { me: PublicUser }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);

  /* 点外面关掉 + Esc 关掉 */
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  /* 头像：用 displayName 或 username 的第一个字符。
     圆角色块：背景色由 user.id 哈希稳定派生 —— 同一用户每次刷新都一个色。
     admin 角色额外有暖色环，方便快速识别"管理员在线"。 */
  const initialChar = (me.displayName || me.username || "?").trim().charAt(0).toUpperCase() || "?";
  const hue = hashHue(me.id);
  const avatarBg = me.role === "admin"
    ? `linear-gradient(135deg, hsl(${hue}, 28%, 36%), hsl(${(hue + 30) % 360}, 32%, 28%))`
    : `linear-gradient(135deg, hsl(${hue}, 22%, 30%), hsl(${(hue + 30) % 360}, 24%, 24%))`;

  /* 菜单项：admin 与 viewer 都含 "后台"（/admin）。
     - admin   进 /admin 看全部
     - viewer  进 /admin 看自己（AdminShell scoped 已按 ownerId 滤过）
     "账户" /account 一律有 —— 改密 / 改显示名在那里。
     之前 viewer 下拉只有 "个人空间 / 账户" 两个 href 都指 /account
     的窘境也顺手清掉（React 重复 key 警告的根源之一）。 */
  const items: Array<{ label: string; href: string; danger?: boolean }> = [
    { label: "相册", href: "/admin" },
    { label: "账户", href: "/account" },
  ];

  return (
    <span
      ref={wrapRef}
      className={`${styles.nav__auth} ${styles["nav__usermenu"] ?? ""}`}
    >
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${me.displayName || me.username} 的菜单`}
        className={`${styles["nav__usermenu-btn"] ?? ""} ${
          open ? (styles["nav__usermenu-btn--open"] ?? "") : ""
        }`}
        onClick={() => setOpen((v) => !v)}
      >
        {/* 头像圆：32px mono 大写首字 */}
        <span
          className={styles["nav__avatar"] ?? ""}
          style={{ background: avatarBg }}
          aria-hidden="true"
        >
          {initialChar}
        </span>
        {/* 桌面端显示小字 username，让人确认登录的是谁；面板打开时隐藏
            文字（仅显示头像 + caret）以让 panel 干净。 */}
        <span
          className={`${styles["nav__userlabel"] ?? ""} ${
            open ? (styles["nav__userlabel--hidden"] ?? "") : ""
          }`}
        >
          @{me.username}
        </span>
        <span
          className={`${styles["nav__caret"] ?? ""} ${
            open ? (styles["nav__caret--open"] ?? "") : ""
          }`}
          aria-hidden="true"
        >
          ▾
        </span>
      </button>
      {open ? (
        <ul
          role="menu"
          className={`${styles["nav__usermenu-panel"] ?? ""}`}
        >
          {/* 面板顶部：头像 + 用户名 + 角色徽标 —— 让用户清楚自己登录的是谁 */}
          <li role="none" className={styles["nav__usermenu-header"] ?? ""}>
            <span
              className={`${styles["nav__avatar"] ?? ""} ${styles["nav__avatar--lg"] ?? ""}`}
              style={{ background: avatarBg }}
              aria-hidden="true"
            >
              {initialChar}
            </span>
            <span className={styles["nav__usermenu-id"] ?? ""}>
              <span className={styles["nav__usermenu-name"] ?? ""}>
                {me.displayName || me.username}
              </span>
              <span className={styles["nav__usermenu-role"] ?? ""}>
                {me.role === "admin" ? "管理员" : "访客"} · @{me.username}
              </span>
            </span>
          </li>
          <li role="none" className={styles["nav__usermenu-sep"] ?? ""} />
          {items.map((it) => (
            <li key={it.href} role="none">
              <a role="menuitem" href={it.href} onClick={() => setOpen(false)}>
                {it.label}
              </a>
            </li>
          ))}
          <li role="none" className={styles["nav__usermenu-sep"] ?? ""}>
            <LogoutButton onAfter={() => setOpen(false)} danger />
          </li>
        </ul>
      ) : null}
    </span>
  );
}

/* ============================================================
   LogoutButton —— 抽出来仅为让 onClick 处理（drawer / desktop）共用
   ============================================================ */
function LogoutButton({
  onAfter,
  danger = false,
}: {
  onAfter?: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      className={danger ? styles["nav__usermenu-danger"] ?? "" : ""}
      onClick={() => {
        if (onAfter) onAfter();
        void logoutSession()
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

/* ============================================================
   工具：user id → 0..360 色相值
   ------------------------------------------------------------
   FNV-1a 32-bit 哈希取前几位。同一 id 永远得到同一色相 —— 用户视觉上
   锁定"自己的颜色"。与 CSS 变量无依赖，颜色直接传给 style。
   ============================================================ */
function hashHue(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  /* 取 24 位（正数）+ 映射到 0..360 */
  return ((h >>> 0) % 360);
}
