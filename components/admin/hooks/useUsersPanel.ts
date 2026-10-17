/**
 * useUsersPanel —— 后台用户管理列表 + 全部用户操作状态
 * ------------------------------------------------------------------
 * 拆出来的状态：
 *   - 新建用户表单（nUser / nPass / nName）
 *   - 重置密码草稿（pwFor / pwVal）
 *   - 重置链接弹层（linkFor / linkInfo / copied）
 *   - 通用提示（msg）
 *
 * 操作：
 *   loadUsers()               拉一次
 *   createUser / resetPassword / changeDisplayName / toggleDisabled /
 *   deleteUser / generateResetLink / revokeUser / copyLink / closeLink
 *
 * 这样能让 UsersTab 几乎只剩 JSX 渲染。
 *
 * 不依赖 React Context —— 上层需要时直接传 props。
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createUser,
  deleteUser,
  fetchUsers,
  generateResetLink,
  revokeUserSessions,
  updateUser,
} from "@/lib/admin-api";
import type {
  PublicUser,
  ResetLinkResponse,
} from "@/lib/contracts";

export type UseUsersPanelOptions = {
  /** 已登录后才启用数据拉取与变更 */
  enabled: boolean;
};

export type Notice = { kind: "ok" | "err"; text: string };

export type UseUsersPanelResult = {
  users: PublicUser[];
  msg: Notice | null;
  /* 表单态 */
  nUser: string;
  nPass: string;
  nName: string;
  setNUser: (v: string) => void;
  setNPass: (v: string) => void;
  setNName: (v: string) => void;
  /* 改密草稿 */
  pwFor: string | null;
  pwVal: string;
  setPwFor: (id: string | null) => void;
  setPwVal: (v: string) => void;
  /* 重置链接弹层 */
  linkFor: string | null;
  linkInfo: ResetLinkResponse | null;
  linkBusy: boolean;
  copied: boolean;
  /* 操作 */
  addUser: (e: React.FormEvent) => Promise<void>;
  resetPassword: (id: string) => Promise<void>;
  setDisplayName: (u: PublicUser, v: string) => Promise<void>;
  toggleDisabled: (u: PublicUser) => Promise<void>;
  removeUser: (u: PublicUser) => Promise<void>;
  generateLink: (u: PublicUser) => Promise<void>;
  kickUser: (u: PublicUser) => Promise<void>;
  copyLink: () => Promise<void>;
  closeLink: () => void;
  loadUsers: () => Promise<void>;
};

export function useUsersPanel(
  opts: UseUsersPanelOptions,
): UseUsersPanelResult {
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [msg, setMsg] = useState<Notice | null>(null);

  const [nUser, setNUser] = useState("");
  const [nPass, setNPass] = useState("");
  const [nName, setNName] = useState("");

  const [pwFor, setPwFor] = useState<string | null>(null);
  const [pwVal, setPwVal] = useState("");

  const [linkFor, setLinkFor] = useState<string | null>(null);
  const [linkInfo, setLinkInfo] = useState<ResetLinkResponse | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* 列表拉取 */
  const loadUsers = useCallback(async () => {
    try {
      const list = await fetchUsers();
      setUsers(list);
    } catch {
      /* 沿用旧行为：忽略错误，UI 仍展示旧数据 */
    }
  }, []);

  useEffect(() => {
    if (opts.enabled) loadUsers();
  }, [opts.enabled, loadUsers]);

  const addUser = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setMsg(null);
      try {
        await createUser({
          username: nUser,
          password: nPass,
          displayName: nName || undefined,
        });
        setNUser("");
        setNPass("");
        setNName("");
        setMsg({ kind: "ok", text: "用户已创建" });
        await loadUsers();
      } catch (err) {
        setMsg({ kind: "err", text: (err as Error).message });
      }
    },
    [nUser, nPass, nName, loadUsers],
  );

  const resetPassword = useCallback(
    async (id: string) => {
      setMsg(null);
      try {
        await updateUser(id, { password: pwVal });
        setPwFor(null);
        setPwVal("");
        setMsg({ kind: "ok", text: "密码已更新" });
        await loadUsers();
      } catch (err) {
        setMsg({ kind: "err", text: (err as Error).message });
      }
    },
    [pwVal, loadUsers],
  );

  const setDisplayName = useCallback(
    async (u: PublicUser, v: string) => {
      try {
        await updateUser(u.id, { displayName: v });
        await loadUsers();
      } catch (err) {
        setMsg({ kind: "err", text: (err as Error).message });
      }
    },
    [loadUsers],
  );

  const toggleDisabled = useCallback(
    async (u: PublicUser) => {
      setMsg(null);
      try {
        await updateUser(u.id, { disabled: !u.disabled });
        setMsg({ kind: "ok", text: u.disabled ? "已启用" : "已停用" });
        await loadUsers();
      } catch (err) {
        setMsg({ kind: "err", text: (err as Error).message });
      }
    },
    [loadUsers],
  );

  const removeUser = useCallback(
    async (u: PublicUser) => {
      if (
        !confirm(
          `确定删除用户 ${u.username}？\n\n` +
            `此操作会同时删除该用户的全部照片（COS 对象 + 元数据）与相册，\n` +
            `且**不可撤销**。`,
        )
      ) {
        return;
      }
      setMsg(null);
      try {
        const { deleted: d } = await deleteUser(u.id);
        setMsg({
          kind: "ok",
          text: d
            ? `用户已删除：${d.photos} 张照片 / ${d.albums} 个相册 / ${d.objectsDeleted} 个对象`
            : "用户已删除",
        });
        await loadUsers();
      } catch (err) {
        setMsg({ kind: "err", text: (err as Error).message });
      }
    },
    [loadUsers],
  );

  const generateLink = useCallback(async (u: PublicUser) => {
    setMsg(null);
    setLinkFor(u.id);
    setLinkInfo(null);
    setCopied(false);
    setLinkBusy(true);
    try {
      setLinkInfo(await generateResetLink(u.id));
    } catch (err) {
      setLinkFor(null);
      setMsg({ kind: "err", text: (err as Error).message });
    } finally {
      setLinkBusy(false);
    }
  }, []);

  const kickUser = useCallback(
    async (u: PublicUser) => {
      if (!confirm(`确定吊销 ${u.username} 的所有会话？`)) return;
      setMsg(null);
      try {
        await revokeUserSessions(u.id);
        setMsg({ kind: "ok", text: `已踢出 ${u.username}` });
        await loadUsers();
      } catch (err) {
        setMsg({ kind: "err", text: (err as Error).message });
      }
    },
    [loadUsers],
  );

  const copyLink = useCallback(async () => {
    if (!linkInfo) return;
    try {
      await navigator.clipboard.writeText(linkInfo.url);
      setCopied(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      setMsg({ kind: "err", text: "复制失败，请手动选中链接" });
    }
  }, [linkInfo]);

  const closeLink = useCallback(() => {
    setLinkFor(null);
    setLinkInfo(null);
    setCopied(false);
  }, []);

  return {
    users,
    msg,
    nUser,
    nPass,
    nName,
    setNUser,
    setNPass,
    setNName,
    pwFor,
    pwVal,
    setPwFor,
    setPwVal,
    linkFor,
    linkInfo,
    linkBusy,
    copied,
    addUser,
    resetPassword,
    setDisplayName,
    toggleDisabled,
    removeUser,
    generateLink,
    kickUser,
    copyLink,
    closeLink,
    loadUsers,
  };
}
