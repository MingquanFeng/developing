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
import ConfirmModal from "../modals/ConfirmModal";
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

  /* 错误状态分支：
     - 有 loadErr 且已有旧数据 → 顶部黄色 banner（不盖列表）+ 重试按钮
     - 有 loadErr 且无数据     → 整块红色错误卡 + 重试按钮（替代"静默空列表"）
     这样网络抖动 / cookie 失效 / 401 时用户能立刻看到，而不是看到一片空白 */
  const showFullError = u.loadErr !== null && u.users.length === 0;
  const showBanner = u.loadErr !== null && u.users.length > 0;

  return (
    <div>
      {/* 批 3.4 新增 toolbar */}
      <header className={styles.usersToolbar}>
        <div className={styles.pageHeader}>
          <h2 className={styles.pageTitle}>用户</h2>
          <span className={styles.pageSub}>共 {u.users.length} 个</span>
        </div>
        <div className={styles.toolbarSpacer} />
      </header>

      {u.msg ? (
        <p className={u.msg.kind === "ok" ? styles.ok : styles.err}>
          {u.msg.text}
        </p>
      ) : null}

      {showBanner ? (
        <div
          className={styles.errBanner}
          role="alert"
          data-testid="users-load-banner"
        >
          <span>
            列表刷新失败：{u.loadErr}（旧数据仍在下方，新操作可能不一致）
          </span>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnGhost}`}
            onClick={() => void u.loadUsers()}
            disabled={u.loading}
          >
            {u.loading ? "重试中…" : "重试"}
          </button>
        </div>
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

      {u.confirmModal ? <ConfirmModal {...u.confirmModal} /> : null}

      {showFullError ? (
        <div
          className={styles.errCard}
          role="alert"
          data-testid="users-load-error"
        >
          <span className={styles.errCardTitle}>加载用户列表失败</span>
          <span className={styles.errCardDetail}>{u.loadErr}</span>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary}`}
            style={{ width: "auto", marginTop: 12, padding: "9px 20px" }}
            onClick={() => void u.loadUsers()}
            disabled={u.loading}
            data-testid="users-retry"
          >
            {u.loading ? "重试中…" : "重试"}
          </button>
        </div>
      ) : u.loading && u.users.length === 0 ? (
        <p className={styles.muted} data-testid="users-loading">
          正在加载用户列表…
        </p>
      ) : (
        /* 批 3.4: ul → table 元素, 5 列表头 (语义化 + a11y) */
        <div className={styles.userTableWrap}>
          <table className={styles.userTable}>
            <thead className={styles.userTableHeader}>
              <tr>
                <th>用户名</th>
                <th>显示名</th>
                <th>最近登录</th>
                <th>状态</th>
                <th className={styles.userTableAction}>操作</th>
              </tr>
            </thead>
            <tbody>
              {u.users.length === 0 ? (
                <tr>
                  <td colSpan={5} className={styles.userTableCell}>
                    <span className={styles.dim}>暂无用户。</span>
                  </td>
                </tr>
              ) : null}
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
            </tbody>
          </table>
        </div>
      )}

      {/* 批 3.4: 新建用户表单从 5-col grid 升级为 .card 容器 + .fieldRow 列表 */}
      <form className={styles.userAddCard} onSubmit={u.addUser}>
        <h3 className={styles.userAddTitle}>新建用户</h3>
        <div className={styles.userAddFields}>
          <div className={styles.fieldRow}>
            <label className={styles.fieldLabel} htmlFor="new-username">
              用户名
            </label>
            <input
              id="new-username"
              className={styles.input}
              value={u.nUser}
              onChange={(e) => u.setNUser(e.target.value)}
              placeholder="字母数字，≥3 位"
            />
          </div>
          <div className={styles.fieldRow}>
            <label className={styles.fieldLabel} htmlFor="new-password">
              密码
            </label>
            <input
              id="new-password"
              className={styles.input}
              type="password"
              value={u.nPass}
              onChange={(e) => u.setNPass(e.target.value)}
              placeholder="≥8 位"
              autoComplete="new-password"
            />
          </div>
          <div className={styles.fieldRow}>
            <label className={styles.fieldLabel} htmlFor="new-displayname">
              显示名
            </label>
            <input
              id="new-displayname"
              className={styles.input}
              value={u.nName}
              onChange={(e) => u.setNName(e.target.value)}
              placeholder="可选"
            />
          </div>
        </div>
        <div className={styles.userAddAction}>
          <button
            type="submit"
            className={`${styles.btn} ${styles.btnPrimary}`}
            disabled={!u.nUser || !u.nPass}
          >
            创建
          </button>
        </div>
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
  const isMe = user.id === meId;
  const isEditing = pwFor === user.id;

  return (
    <tr className={styles.userTableRow}>
      <td className={styles.userTableCell}>
        <input className={styles.input} value={user.username} disabled />
      </td>
      <td className={styles.userTableCell}>
        <input
          className={styles.input}
          value={user.displayName}
          onChange={async (e) => {
            await onSetDisplayName(e.target.value);
          }}
        />
      </td>
      <td className={styles.userTableCell}>
        <span className={styles.dim}>
          {user.lastLoginAt
            ? `最近登录 ${user.lastLoginAt
                .slice(0, 16)
                .replace("T", " ")}${user.lastLoginIp ? ` · ${user.lastLoginIp}` : ""}`
            : "从未登录"}
        </span>
      </td>
      <td className={styles.userTableCell}>
        {/* 批 3.4: 状态徽章 — .badgeOk / .badgeWarn (批 1 共享) */}
        {user.disabled ? (
          <span className={styles.badgeWarn}>已停用</span>
        ) : (
          <span className={styles.badgeOk}>启用</span>
        )}
      </td>
      <td className={`${styles.userTableCell} ${styles.userTableAction}`}>
        {isEditing ? (
          <div className={styles.fieldRow}>
            <input
              className={styles.input}
              type="password"
              value={pwVal}
              onChange={(e) => setPwVal(e.target.value)}
              placeholder="新密码"
              style={{ width: 130 }}
            />
            <button
              className={`${styles.btn} ${styles.btnGhost}`}
              onClick={onResetPassword}
            >
              保存
            </button>
            <button
              className={`${styles.btn} ${styles.btnGhost}`}
              onClick={() => setPwFor(null)}
            >
              取消
            </button>
          </div>
        ) : (
          <div className={styles.userTableActionGroup}>
            <button
              className={`${styles.btn} ${styles.btnGhost}`}
              onClick={() => setPwFor(user.id)}
            >
              改密码
            </button>
            <button
              className={`${styles.btn} ${styles.btnGhost}`}
              onClick={onGenerateLink}
            >
              重置链接
            </button>
            <button
              className={`${styles.btn} ${styles.btnGhost}`}
              onClick={onToggleDisabled}
            >
              {user.disabled ? "启用" : "停用"}
            </button>
            <button
              className={`${styles.btn} ${styles.btnDanger}`}
              onClick={onKick}
              disabled={isMe}
              title={isMe ? "不能吊销自己的会话" : undefined}
            >
              踢出
            </button>
            <button
              className={`${styles.btn} ${styles.btnDanger}`}
              onClick={onRemove}
              disabled={isMe}
              title={isMe ? "不能删除当前登录的账号" : undefined}
            >
              删除
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}
