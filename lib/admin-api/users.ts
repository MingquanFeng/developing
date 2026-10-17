/**
 * 后台用户管理 API
 * ------------------------------------------------------------------
 * 端点集合：
 *   GET    /api/users                      —— 列出用户
 *   POST   /api/users                      —— 新建
 *   PATCH  /api/users/[id]                 —— 更新显示名 / disabled / 密码
 *   DELETE /api/users/[id]                 —— 物理删除该用户与他的全部相册
 *   POST   /api/users/[id]/reset-link      —— 生成一次性重置密码链接
 *   POST   /api/users/[id]/sessions/revoke —— 踢出所有会话（bump sessionVersion）
 *
 * 与 POST /api/signer/users 那种维护 CLI 流程**不同**：那是在服务端建
 * 第一个用户的脚本，参见 scripts/user.js。
 */
import { apiFetch, readJson } from "./client";
import { asApiError } from "./errors";
import type { PublicUser, ResetLinkResponse } from "@/lib/contracts";

/** GET /api/users 响应 */
export type UsersListResponse = {
  users: PublicUser[];
};

/** GET /api/users */
export async function fetchUsers(): Promise<PublicUser[]> {
  const r = await apiFetch("/api/users");
  if (!r.ok) await asApiError(r, "获取用户列表失败");
  const d = await readJson<UsersListResponse>(r);
  return d.users;
}

/**
 * 创建用户。
 *
 * 必填：username、password。displayName 可选。
 * 服务端会校验用户名（≥3 位、字母数字）与密码强度（≥8 位）。
 */
export type CreateUserInput = {
  username: string;
  password: string;
  displayName?: string;
};

export async function createUser(input: CreateUserInput): Promise<void> {
  const r = await apiFetch("/api/users", {
    method: "POST",
    body: input,
  });
  if (!r.ok) await asApiError(r, "新建用户失败");
}

/**
 * PATCH /api/users/[id] —— 修改用户。可改：
 *   displayName / disabled / password / role
 * （role 只允许 admin 改；本模块不暴露，传错会被服务端拒）
 */
export type UpdateUserInput = Partial<{
  displayName: string;
  disabled: boolean;
  password: string;
  role: "admin" | "viewer";
}>;

export async function updateUser(
  id: string,
  patch: UpdateUserInput,
): Promise<void> {
  const r = await apiFetch(`/api/users/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: patch,
  });
  if (!r.ok) await asApiError(r, "更新用户失败");
}

/** DELETE /api/users/[id] —— 该用户的相册与照片元数据会被一并清理 */
export type DeleteUserResponse = {
  deleted?: { photos: number; albums: number; objectsDeleted: number };
};

export async function deleteUser(id: string): Promise<DeleteUserResponse> {
  const r = await apiFetch(`/api/users/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!r.ok) await asApiError(r, "删除用户失败");
  return await readJson<DeleteUserResponse>(r);
}

/** 生成一次性重置链接（24h 有效） */
export async function generateResetLink(id: string): Promise<ResetLinkResponse> {
  const r = await apiFetch(
    `/api/users/${encodeURIComponent(id)}/reset-link`,
    { method: "POST" },
  );
  if (!r.ok) await asApiError(r, "生成重置链接失败");
  return await readJson<ResetLinkResponse>(r);
}

/** 踢出该用户的所有会话（其实就是 bump sessionVersion） */
export async function revokeUserSessions(id: string): Promise<void> {
  const r = await apiFetch(
    `/api/users/${encodeURIComponent(id)}/sessions/revoke`,
    { method: "POST" },
  );
  if (!r.ok) await asApiError(r, "踢出用户失败");
}
