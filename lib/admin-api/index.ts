/**
 * 后台客户端 SDK barrel
 * ------------------------------------------------------------------
 * AdminApp 与未来移动端 / 工具脚本统一从这里 import。
 *
 * 命名约定：
 *   - 动词性操作（login/logout/trash/restore/...）= `xxxAction`
 *   - 取数操作（fetchXxx）= `fetchXxx`
 *   - 错误处理（describeApiError / asApiError）从 errors 子模块走
 *
 * 不依赖后台任何 React/AdminApp 内部的状态；调用方负责传 formData、
 * 显示 toast 等 UI 副作用。
 */

// 客户端原语
export { apiFetch, readJson, API_BASE } from "./client";

// 错误
export {
  describeApiError,
  asApiError,
  isNetworkError,
  NETWORK_DOWN_HINT,
} from "./errors";

// 会话
export {
  fetchSession,
  loginSession,
  logoutSession,
  type SessionResponse,
} from "./auth";

// 清单
export {
  fetchManifest,
  updateManifest,
  type ManifestDraft,
} from "./manifest";

// 照片
export {
  patchPhoto,
  trashPhoto,
  restorePhoto,
  purgePhoto,
  type PatchPhotoResponse,
} from "./photos";

// 用户
export {
  fetchUsers,
  createUser,
  updateUser,
  deleteUser,
  generateResetLink,
  revokeUserSessions,
  type UsersListResponse,
  type CreateUserInput,
  type UpdateUserInput,
  type DeleteUserResponse,
} from "./users";

// 上传签名
export {
  presignUpload,
  SIGN_BATCH_LIMIT,
  type SignRequestFile,
  type SignResponseItem,
} from "./upload";

// 首页内容（后台动态化）
export {
  fetchSiteContent,
  saveSiteSection,
  resetSiteSection,
  type SiteContentDraft,
  type SiteContentResponse,
} from "./site-content";
