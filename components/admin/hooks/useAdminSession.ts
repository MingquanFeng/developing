/**
 * useAdminSession —— 后台会话状态机
 * ------------------------------------------------------------------
 * 状态机：
 *   status: 'loading' 探测中（首屏）
 *           'anonymous' 未登录
 *           'authed' 已登录
 *
 *   me: 当前 PublicUser（authed 时）
 *   busy: 登录中
 *   error: 登录错误 message
 *
 * 关键变更（PR-7）：
 *   接受 `initialMe` prop —— 由 server component 在 SSR 阶段把 user
 *   解析好传进来。这样首屏 HTML 直接是 'authed' 态，不依赖 client
 *   fetch /api/session，**不会再有"点后台都要重新登录"的 bug**。
 *
 *   client 端 useEffect 仍跑探活：用于 cookie 改动后刷新 me 状态
 *   （用户在 Nav 退出登录 → AdminApp 探活拿到 null → 切 anonymous）。
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchSession, loginSession, logoutSession } from "@/lib/admin-api";
import { NETWORK_DOWN_HINT, isNetworkError } from "@/lib/admin-api";
import type { PublicUser } from "@/lib/contracts";

export type SessionStatus = "loading" | "anonymous" | "authed";

export type UseAdminSessionOptions = {
  /** Server 端已读 cookie 拿到的 user；首屏直接 authed */
  initialMe?: PublicUser | null;
  /** AdminApp 想在哪些 tab 上"停"。登录后若角色变了，
   *  自动从 admin-only tab 切走。 */
  currentTab?: string;
  /** 切走的回调：AdminApp 拿到字符串后 setTab 用。 */
  onSwitchAwayFromAdminOnlyTabs?: () => void;
};

export type UseAdminSessionResult = {
  status: SessionStatus;
  me: PublicUser | null;
  busy: boolean;
  error: string;
  username: string;
  password: string;
};

export type UseAdminSessionApi = UseAdminSessionResult & {
  setUsername: (v: string) => void;
  setPassword: (v: string) => void;
  login: () => Promise<void>;
  logout: () => Promise<void>;
};

export function useAdminSession(
  opts: UseAdminSessionOptions = {},
): UseAdminSessionApi {
  /* 首屏 initialMe 真有 → 直接 authed；否则 loading 等待 client 探活
     —— 与 Nav 修法一致，根除"hydrate 后才切到正确态"的视觉抖动。 */
  const initialStatus: SessionStatus = opts.initialMe
    ? "authed"
    : "loading";
  const [status, setStatus] = useState<SessionStatus>(initialStatus);
  const [me, setMe] = useState<PublicUser | null>(opts.initialMe ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  /* login 表单态提到 hook，避免子组件 unmount 时丢输入 */
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  /* Client-side refresh：仅在 initialMe 与服务端不一致时（如其他 tab 退出登录）
     拉一次 /api/session。不再是"页面 mount 必须探活"。 */
  useEffect(() => {
    /* initialMe 已有 → 跳过启动探活；仅在某种 fallback 触发（如外部清 cookie） */
    if (opts.initialMe) return;
    let cancelled = false;
    fetchSession()
      .then((user) => {
        if (cancelled) return;
        if (user) {
          setMe(user);
          setStatus("authed");
        } else {
          setStatus("anonymous");
        }
      })
      .catch((err) => {
        if (cancelled) return;
        // 网络错：保留当前 me（可能已 authed），让用户至少能看到后台
        if (process.env.NODE_ENV !== "production") {
          console.warn("[useAdminSession] /api/session probe failed:", err);
        }
      });
    return () => {
      cancelled = true;
    };
    // initialMe 是 Props —— 不放 deps；这只在 mount 时跑一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const user = await loginSession(username, password);
      setMe(user);
      setStatus("authed");
      if (
        user.role !== "admin" &&
        opts.currentTab === "users"
      ) {
        opts.onSwitchAwayFromAdminOnlyTabs?.();
      }
      setPassword(""); // 登录成功清空密码
    } catch (e) {
      const msg = (e as Error).message;
      setError(isNetworkError(msg) ? NETWORK_DOWN_HINT : msg);
    } finally {
      setBusy(false);
    }
  }, [opts, username, password]);

  const logout = useCallback(async () => {
    // 退出失败吞掉 —— 用户操作上等价于已退出
    await logoutSession().catch(() => {});
    setMe(null);
    setStatus("anonymous");
  }, []);

  return {
    status,
    me,
    busy,
    error,
    username,
    password,
    setUsername,
    setPassword,
    login,
    logout,
  };
}
