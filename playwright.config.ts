import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E 配置
 * ------------------------------------------------------------------
 * 跑真实浏览器（Chromium）走主流程：admin 登录 → 系统设置 → 改首页
 * 内容 → 保存 → 回首页验证 → 重置为默认。
 *
 * ⚠️ 用**独立 SQLite**（data/users_e2e.db），不碰真实的 data/users.db。
 *    webServer 起服务时注入 USERS_DB_PATH 环境变量。
 *
 * CI 上跑需要：
 *   npx playwright install --with-deps chromium
 */
export default defineConfig({
  testDir: "./e2e",
  /* E2E 跑真浏览器，比单测慢 —— 给足超时 */
  timeout: 60_000,
  expect: { timeout: 10_000 },
  /* 建测试用 admin 账号（webServer 起来后跑） */
  globalSetup: "./e2e/global-setup.ts",
  /* 失败时留截图 + trace，便于排查 */
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3200",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "zh-CN",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  /* 失败不重试 —— 重试会掩盖真问题 */
  retries: 0,
  workers: 1,
  webServer: {
    /* 用 next start（生产模式）—— dev server 编译慢且行为不同 */
    command:
      "USERS_DB_PATH=./data/users_e2e.db npx next start --port 3200",
    url: "http://localhost:3200/api/healthz",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
