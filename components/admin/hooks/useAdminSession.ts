/**
 * useAdminSession —— 后台会话状态机
 * ------------------------------------------------------------------
 * 5 个状态合一：
 *   status: 'loading' 探测中（首次进入 /api/session）
 *           'anonymous' 未登录（已确认服务端无 user）
 *           'authed' 已登录
 *
 *   me: 当前 PublicUser（authed 时）
 *   busy: 登录中
 *   error: 登录错误 message
 *
 * 操作：
 *   login(username, password)
 *   logout()
 *
 * 注意：登录成功后角色若不是 admin 且当前停留在 users tab，
 * 会自动切回 photos —— 那是 admin-only tab。原 AdminApp 内嵌此
 * 行为；保留以兼容。
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchSession, loginSession, logoutSession } from "@/lib/admin-api";
import { NETWORK_DOWN_HINT, isNetworkError } from "@/lib/admin-api";
import type { PublicUser } from "@/lib/contracts";

export type SessionStatus = "loading" | "anonymous" | "authed";

export type UseAdminSessionOptions = {
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
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [me, setMe] = useState<PublicUser | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  /* login 表单态提到 hook，避免子组件 unmount 时丢输入 */
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  /* 探测会话（页面挂载时一次性） */
  useEffect(() => {
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
      .catch(() => {
        if (cancelled) return;
        setStatus("anonymous");
      });
    return () => {
      cancelled = true;
    };
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
