"use client";

/**
 * UsersTab —— 后台用户管理 tab
 * ------------------------------------------------------------------
 * 状态全部在 useUsersPanel 里；本组件只负责列表 + 表单 + 弹层渲染。
 *
 * 提示 / 弹层文案：
 *   - 顶层通知 (top msg) 在 AdminShell 里；本 tab 只显示自己的 msg
 *   - 重置链接弹层用 ResetLinkModal 组件
 *
 * 设计点：所有 CRUD 操作都通过 hook；不持有任何业务 state。
 */
import { useUsersPanel } from "../hooks/useUsersPanel";
import ResetLinkModal from "../modals/ResetLinkModal";
import type { Album, Photo, PublicUser } from "@/lib/contracts";
import styles from "../admin.module.css";

export type UsersTabProps = {
  me: PublicUser | null;
  /** onSetCoverAlbum 由 UsersTab 转发来自 AdminApp 的"封面"按钮 */
  onSetCoverAlbum: (album: Album) => void;
};

export default function UsersTab({ me, onSetCoverAlbum }: UsersTabProps) {
  const u = useUsersPanel({ enabled: me?.role === "admin" });

  return (
    <div>
      {u.msg ? (
        <p className={u.msg.kind === "ok" ? styles.ok : styles.err}>
          {u.msg.text}
        </p>
      ) : null}

      {u.linkFor ? (
        <ResetLinkModal
          linkInfo={u.linkInfo}
          linkBusy={u.linkBusy}
          copied={u.copied}
          onCopy={u.copyLink}
          onClose={u.closeLink}
        />
      ) : null}

      <ul className={styles.list}>
        {u.users.map((user) => (
          <UserRow
            key={user.id}
            user={user}
            meId={me?.id ?? null}
            pwFor={u.pwFor}
            pwVal={u.pwVal}
            setPwFor={u.setPwFor}
            setPwVal={u.setPwVal}
            onSetDisplayName={(v) => u.setDisplayName(user, v)}
            onResetPassword={() => u.resetPassword(user.id)}
            onToggleDisabled={() => u.toggleDisabled(user)}
            onGenerateLink={() => u.generateLink(user)}
            onKick={() => u.kickUser(user)}
            onRemove={() => u.removeUser(user)}
            onSetCoverAlbum={onSetCoverAlbum}
          />
        ))}
      </ul>

      <form className={styles.addUser} onSubmit={u.addUser}>
        <span className={styles.addTitle}>新建用户</span>
        <input
          className={styles.input}
          value={u.nUser}
          onChange={(e) => u.setNUser(e.target.value)}
          placeholder="用户名（字母数字，≥3 位）"
        />
        <input
          className={styles.input}
          type="password"
          value={u.nPass}
          onChange={(e) => u.setNPass(e.target.value)}
          placeholder="密码（≥8 位）"
          autoComplete="new-password"
        />
        <input
          className={styles.input}
          value={u.nName}
          onChange={(e) => u.setNName(e.target.value)}
          placeholder="显示名（可选）"
        />
        <button
          className={styles.primary}
          style={{ width: "auto", marginTop: 0, padding: "9px 20px" }}
          disabled={!u.nUser || !u.nPass}
        >
          创建
        </button>
      </form>
    </div>
  );
}

/* ============================================================
   UserRow —— 单行用户（行内编辑 + 4-5 个动作按钮）
   内联在 UsersTab 内，因为只有它用，且每行 80 行 DOM 代码搬成
   独立文件反而散。
   ============================================================ */
function UserRow({
  user,
  meId,
  pwFor,
  pwVal,
  setPwFor,
  setPwVal,
  onSetDisplayName,
  onResetPassword,
  onToggleDisabled,
  onGenerateLink,
  onKick,
  onRemove,
  onSetCoverAlbum: _onSetCoverAlbum,
}: {
  user: PublicUser;
  meId: string | null;
  pwFor: string | null;
  pwVal: string;
  setPwFor: (id: string | null) => void;
  setPwVal: (v: string) => void;
  onSetDisplayName: (v: string) => void;
  onResetPassword: () => void;
  onToggleDisabled: () => void;
  onGenerateLink: () => void;
  onKick: () => void;
  onRemove: () => void;
  onSetCoverAlbum: (album: Album) => void;
}) {
  return (
    <li className={styles.row}>
      <div className={styles.fields}>
        <input className={styles.input} value={user.username} disabled />
        <input
          className={styles.input}
          value={user.displayName}
          onChange={async (e) => {
            await onSetDisplayName(e.target.value);
          }}
        />
        <span className={styles.dim}>
          {user.lastLoginAt
            ? `最近登录 ${user.lastLoginAt
                .slice(0, 16)
                .replace("T", " ")}${user.lastLoginIp ? ` · ${user.lastLoginIp}` : ""}`
            : "从未登录"}
        </span>
      </div>

      {user.disabled ? <span className={styles.dim}>已停用</span> : null}

      <span className={styles.actions}>
        {pwFor === user.id ? (
          <>
            <input
              className={styles.input}
              type="password"
              value={pwVal}
              onChange={(e) => setPwVal(e.target.value)}
              placeholder="新密码"
              style={{ width: 130 }}
            />
            <button className={styles.mini} onClick={onResetPassword}>
              保存
            </button>
            <button className={styles.mini} onClick={() => setPwFor(null)}>
              取消
            </button>
          </>
        ) : (
          <>
            <button className={styles.mini} onClick={() => setPwFor(user.id)}>
              改密码
            </button>
            <button className={styles.mini} onClick={onGenerateLink}>
              生成重置链接
            </button>
            <button className={styles.mini} onClick={onToggleDisabled}>
              {user.disabled ? "启用" : "停用"}
            </button>
            <button
              className={styles.miniDanger}
              onClick={onKick}
              disabled={user.id === meId}
              title={user.id === meId ? "不能吊销自己的会话" : undefined}
            >
              踢出此账号
            </button>
            <button
              className={styles.miniDanger}
              onClick={onRemove}
              disabled={user.id === meId}
              title={user.id === meId ? "不能删除当前登录的账号" : undefined}
            >
              删除
            </button>
          </>
        )}
      </span>
    </li>
  );
}
