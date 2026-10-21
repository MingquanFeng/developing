/**
 * E2E global setup —— 建测试用的 admin 账号
 * ------------------------------------------------------------------
 * playwright 的 webServer 先起（它会建 users_e2e.db 的表 + seed 静态
 * 默认值），globalSetup 在其后跑 —— 所以这里能直接往表里插用户。
 *
 * ⚠️ 用的是**独立 DB**（data/users_e2e.db），与真实的 data/users.db
 *    完全隔离。E2E 跑完可随时删。
 */
// @ts-expect-error node:sqlite 是 Node 22+ 内置模块，@types/node 20 还没声明
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";

const DB_PATH =
  process.env.USERS_DB_PATH ??
  path.join(process.cwd(), "data", "users_e2e.db");

export const E2E_ADMIN_USER = "photog";
export const E2E_ADMIN_PASS = "testpw123456";

export default function globalSetup(): void {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  if (!fs.existsSync(DB_PATH)) {
    throw new Error(
      `E2E 数据库不存在：${DB_PATH}（webServer 应该已建好 tables）`,
    );
  }

  const db = new DatabaseSync(DB_PATH);
  const hash = bcrypt.hashSync(E2E_ADMIN_PASS, 10);

  const existing = db
    .prepare("SELECT id FROM users WHERE username = ?")
    .get(E2E_ADMIN_USER) as { id: string } | undefined;

  if (existing) {
    /* 已存在 → 重置密码 + 提权为 admin（保证每次跑都可用） */
    db.prepare(
      `UPDATE users SET password_hash = ?, role = 'admin', disabled = 0,
                         session_version = 1
         WHERE username = ?`,
    ).run(hash, E2E_ADMIN_USER);
  } else {
    db.prepare(
      `INSERT INTO users
         (id, username, password_hash, display_name, role, disabled,
          session_version, created_at)
       VALUES (?, ?, ?, ?, 'admin', 0, 1, ?)`,
    ).run(
      `usr_e2e_admin`,
      E2E_ADMIN_USER,
      hash,
      "E2E Admin",
      new Date().toISOString(),
    );
  }
  db.close();
}
