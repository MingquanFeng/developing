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
import type { ConfirmModalProps } from "../modals/ConfirmModal";

export type UseUsersPanelOptions = {
  /** 已登录后才启用数据拉取与变更 */
  enabled: boolean;
};

export type Notice = { kind: "ok" | "err"; text: string };

export type UseUsersPanelResult = {
  users: PublicUser[];
  msg: Notice | null;
  /** 列表拉取失败时的错误 message；null = 没出错或还在首次加载中。
   *  与 users 同时存在：失败也保留旧数据不抹掉，方便"重试"按钮语义清晰。 */
  loadErr: string | null;
  /** 当前是否在拉取列表（首次加载或重试中）；用于 UI 转圈 + 防双击。 */
  loading: boolean;
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
  /** 显式重试入口（错误状态 UI 的重试按钮）；正常 mutation 后也会自动跑一次。 */
  loadUsers: () => Promise<void>;
  /** delete/kick 的二次确认弹层 props；null = 没请求弹窗。
   *  接入层面：父组件直接 <ConfirmModal {...u.confirmModal} /> 即可。
   *  选择暴露完整 props（而不是 confirmReq+resolve）的原因：hook 内部
   *  持有 promise resolve 函数不外露更安全；render 端只关心 Modal 渲染。 */
  confirmModal: ConfirmModalProps | null;
};

export function useUsersPanel(
  opts: UseUsersPanelOptions,
): UseUsersPanelResult {
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [msg, setMsg] = useState<Notice | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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

  /* 二次确认弹层：remove / kick 各请求一次。
     promise resolve 闭包在 state 里 —— 不用 ref，因为弹层生命周期短、
     只在用户点确认/取消后立即清空；中途 unmount 时不 resolve，
     让调用方 await 自然挂起到下次渲染即可。 */
  type ConfirmAction = "remove" | "kick";
  const [confirmReq, setConfirmReq] = useState<{
    user: PublicUser;
    action: ConfirmAction;
    resolve: (v: boolean) => void;
  } | null>(null);

  const requestConfirmFor = useCallback(
    (user: PublicUser, action: ConfirmAction): Promise<boolean> =>
      new Promise<boolean>((resolve) => {
        setConfirmReq({ user, action, resolve });
      }),
    [],
  );

  const onConfirmOk = useCallback(() => {
    const r = confirmReq;
    if (!r) return;
    r.resolve(true);
    setConfirmReq(null);
  }, [confirmReq]);

  const onConfirmCancel = useCallback(() => {
    const r = confirmReq;
    if (!r) return;
    r.resolve(false);
    setConfirmReq(null);
  }, [confirmReq]);

  /* 列表拉取 —— 错误不再 swallow：写入 loadErr 让 UI 暴露（"加载失败 + 重试"）。
     旧行为（仅靠 console）会让 Network 红色 X + 列表为空时用户毫无线索。 */
  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchUsers();
      setUsers(list);
      setLoadErr(null);
    } catch (err) {
      const text = (err as Error).message || String(err);
      setLoadErr(text);
      /* 同时打 console.error —— dev tools 能看到、e2e 也能从 console 事件捞到 */
      // eslint-disable-next-line no-console
      console.error("[useUsersPanel] fetch /api/users failed:", err);
    } finally {
      setLoading(false);
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
      const ok = await requestConfirmFor(u, "remove");
      if (!ok) return;
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
    [loadUsers, requestConfirmFor],
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
      const ok = await requestConfirmFor(u, "kick");
      if (!ok) return;
      setMsg(null);
      try {
        await revokeUserSessions(u.id);
        setMsg({ kind: "ok", text: `已踢出 ${u.username}` });
        await loadUsers();
      } catch (err) {
        setMsg({ kind: "err", text: (err as Error).message });
      }
    },
    [loadUsers, requestConfirmFor],
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

  /* confirmModal —— 从 confirmReq 派生 props；父组件直接 spread 渲染。
     action 不同走不同文案 + danger。busy=false（无 in-flight 操作需要遮罩）。 */
  const confirmModal: ConfirmModalProps | null = (() => {
    if (!confirmReq) return null;
    const { user, action } = confirmReq;
    if (action === "remove") {
      return {
        open: true,
        title: `确定删除用户 ${user.username}？`,
        body:
          "此操作会同时删除该用户的全部照片（COS 对象 + 元数据）与相册，\n且**不可撤销**。",
        danger: true,
        confirmLabel: "删除",
        cancelLabel: "取消",
        busy: false,
        onConfirm: onConfirmOk,
        onCancel: onConfirmCancel,
      };
    }
    return {
      open: true,
      title: `确定吊销 ${user.username} 的所有会话？`,
      body: "该用户的所有登录设备会被立即踢出，需要重新登录。",
      danger: false,
      confirmLabel: "吊销",
      cancelLabel: "取消",
      busy: false,
      onConfirm: onConfirmOk,
      onCancel: onConfirmCancel,
    };
  })();

  return {
    users,
    msg,
    loadErr,
    loading,
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
    confirmModal,
  };
}
