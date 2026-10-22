/**
 * 首页内容后台动态化 —— E2E 主流程
 * ------------------------------------------------------------------
 * 走真实 Chromium：admin 登录 → 系统设置 → 改首页内容 → 保存 → 回首页
 * 验证 → 重置为默认 → 验证回落。
 *
 * 这层补的是 vitest / smoke 覆盖不到的部分：**真实浏览器里的交互**
 * （左栏选块、版本列表、input 事件、React 受控组件、ConfirmModal 点击流）。
 *
 * 后台「系统设置」现在是主从布局：
 *   左栏 = 12 个内容块（ul[aria-label="内容块列表"]）
 *   右栏 = 版本历史（ul[aria-label="版本历史"]）+ 编辑器
 */
import { expect, test, type Page } from "@playwright/test";
import {
  E2E_ADMIN_PASS,
  E2E_ADMIN_USER,
} from "./global-setup";

/**
 * 登录后台（幂等）
 * ------------------------------------------------------------------
 * beforeEach 已经登录过 —— 再访问 /admin/ 会直接进后台（没有登录
 * 表单）。所以先探侧边栏，已登录就直接返回。
 */
async function login(page: Page): Promise<void> {
  await page.goto("/admin/");
  const sidebar = page.locator('aside[aria-label="侧边导航"]');
  if (await sidebar.isVisible().catch(() => false)) return;

  await page.getByLabel("用户名").fill(E2E_ADMIN_USER);
  await page.getByLabel("密码").fill(E2E_ADMIN_PASS);
  await page.getByRole("button", { name: /进入/ }).click();
  /* 侧边栏是 <aside aria-label="侧边导航"> —— role 是 complementary */
  await expect(sidebar).toBeVisible();
}

/** 进「系统设置」tab */
async function openSystemTab(page: Page): Promise<void> {
  await page.getByRole("button", { name: "系统设置" }).click();
  await expect(
    page.getByRole("heading", { name: "系统设置" }),
  ).toBeVisible();
}

/** 「内容版本管理」面板（右栏的一切都在这里面） */
function panel(page: Page) {
  return page.locator('section[aria-label="内容版本管理"]');
}

/** 版本列表（当前选中块的版本） */
function versionList(page: Page) {
  return panel(page).locator('ul[aria-label="版本历史"] > li');
}

/**
 * 断言编辑器内出现「已保存」提示
 *
 * ⚠️ 不能用 page.getByText("已保存") —— 顶栏 shell notice 也有
 * "已保存 site，首页将自动更新"，strict mode 会报歧义。
 */
async function expectSaved(page: Page): Promise<void> {
  await expect(
    panel(page).getByText("已保存", { exact: true }),
  ).toBeVisible();
}

/** 切换到左栏的某个内容块（旧的 <details> 折叠卡没有了） */
async function openSection(
  page: Page,
  label: string,
): Promise<void> {
  await panel(page)
    .locator('ul[aria-label="内容块列表"] button')
    .filter({ hasText: label })
    .first()
    .click();
}

/** 当前选中块的编辑器里的「保存」按钮 */
function saveButton(page: Page) {
  return panel(page)
    .locator('div[aria-label="内容编辑器"]')
    .getByRole("button", { name: "保存", exact: true });
}

/** 全部可编辑 section（清理覆盖值时用） */
const ALL_SECTION_KEYS = [
  "hero",
  "about",
  "subscribe",
  "footer",
  "story",
  "nav",
  "interlude01",
  "interlude03",
  "coords",
  "worksIntro",
  "site",
  "series",
] as const;

/**
 * 每个用例前清空所有 section 的运行时覆盖值
 * ------------------------------------------------------------------
 * 覆盖值存在 SQLite（users_e2e.db），用例之间会互相污染 —— 比如上个
 * 用例把站点标题改了，这个用例的首页 title 断言就挂了。
 *
 * 统一从默认状态开始，用例之间就无顺序依赖。
 */
test.beforeEach(async ({ page }) => {
  await login(page);
  for (const key of ALL_SECTION_KEYS) {
    await page.request.delete(`/api/site/content/${key}`);
  }
});

test.describe("首页内容后台动态化", () => {
  test("首页静态渲染完整（9 幕 + 页脚）", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveTitle(/塞上空许/);
    /* 九幕的锚点 */
    for (const id of [
      "hero",
      "journal",
      "locations",
      "works",
      "story",
      "about",
      "contact",
    ]) {
      await expect(page.locator(`#${id}`)).toHaveCount(1);
    }
    /* 首屏默认文案 */
    await expect(page.getByRole("heading", { name: /至静/ })).toBeVisible();
  });

  test("admin 登录后能进系统设置，左栏列出 12 个内容块", async ({
    page,
  }) => {
    await login(page);
    await openSystemTab(page);

    /* 左栏 = 12 个内容块（不再是 12 个折叠卡） */
    const blocks = panel(page).locator(
      'ul[aria-label="内容块列表"] > li > button',
    );
    await expect(blocks).toHaveCount(12);
    for (const label of [
      "首屏 HERO",
      "第七幕 · 关于",
      "第八幕 · 订阅",
      "第九幕 · 页脚",
      "第五幕 · 主推故事",
      "顶导航",
      "第二幕 · 手记 01",
      "第六幕 · 手记 03",
      "第四幕 · 手记 02",
      "第三幕 · 人像志介绍",
      "站点 meta",
      "第三幕 · 作品系列",
    ]) {
      await expect(blocks.filter({ hasText: label })).toHaveCount(1);
    }
  });

  test("改 HERO 标题 → 保存 → 首页实时反映", async ({ page }) => {
    await login(page);
    await openSystemTab(page);
    await openSection(page, "首屏 HERO");

    const titleInput = page.getByLabel("主标题第 1 行");
    await expect(titleInput).toHaveValue("至静");

    await titleInput.fill("E2E 首屏");
    await saveButton(page).click();
    await expectSaved(page);

    /* 回首页验证反映 */
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /E2E 首屏/ })).toBeVisible();
  });

  test("重置为默认走二次确认，确认后回落静态默认", async ({ page }) => {
    await login(page);
    await openSystemTab(page);
    await openSection(page, "首屏 HERO");

    /* 先改成非默认值 */
    await page.getByLabel("主标题第 1 行").fill("待重置的值");
    await saveButton(page).click();
    await expectSaved(page);

    /* 点「重置为默认」→ 弹确认框 */
    await panel(page)
      .locator('div[aria-label="内容编辑器"]')
      .getByRole("button", { name: "重置为默认" })
      .click();
    await expect(page.getByText("重置首屏为默认")).toBeVisible();

    /* 确认 → 输入框回默认 */
    await page.getByRole("button", { name: "重置", exact: true }).last().click();
    await expect(page.getByLabel("主标题第 1 行")).toHaveValue("至静");

    /* 首页也回落 */
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /至静/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /待重置的值/ })).toHaveCount(0);
  });

  test("nav 的 javascript: href 被服务端拒绝，DB 不被污染", async ({
    page,
  }) => {
    await login(page);
    await openSystemTab(page);
    await openSection(page, "顶导航");

    await page.getByLabel("导航项 1 链接").fill("javascript:alert(1)");
    await saveButton(page).click();

    /* 服务端返回 400 → UI 显示形状不符 */
    await expect(
      panel(page).locator('div[aria-label="内容编辑器"]').getByText(/形状不符合/),
    ).toBeVisible();

    /* DB 未被污染：nav 内容仍不含 javascript: */
    const res = await page.request.get("/api/site/content");
    const body = await res.json();
    expect(JSON.stringify(body.sections.nav)).not.toContain("javascript:");
  });

  test("改站点 meta → 顶栏 brand / 跑马灯 / metadata 全局生效", async ({
    page,
  }) => {
    await login(page);
    await openSystemTab(page);
    await openSection(page, "站点 meta");

    await page.getByLabel("站点名（中文）").fill("E2E 品牌");
    await page.getByLabel("页面标题（metadata title）").fill("E2E 标题");
    await saveButton(page).click();
    await expectSaved(page);

    await page.goto("/");
    await expect(page).toHaveTitle("E2E 标题");
    await expect(page.locator("header").first()).toContainText("E2E 品牌");

    /* 还原，避免污染后续用例（已登录态，直接回后台即可，不用再 login） */
    await page.goto("/admin/");
    await openSystemTab(page);
    await openSection(page, "站点 meta");
    await panel(page)
      .locator('div[aria-label="内容编辑器"]')
      .getByRole("button", { name: "重置为默认" })
      .click();
    await page.getByRole("button", { name: "重置", exact: true }).last().click();
  });

  test("改作品系列名 → 保存 → 首页 WORKS 目录反映", async ({ page }) => {
    await login(page);
    await openSystemTab(page);
    await openSection(page, "第三幕 · 作品系列");

    /* 5 组系列各一个子折叠；改第 1 组的系列名 */
    const group = panel(page)
      .locator('div[aria-label="内容编辑器"]')
      .locator("details")
      .first();
    await group.evaluate((el) => {
      (el as HTMLDetailsElement).open = true;
    });

    const nameInput = page.getByLabel("第 1 组 系列名");
    await expect(nameInput).toHaveValue("上海 03:17");
    await nameInput.fill("E2E 系列名");

    await saveButton(page).click();
    await expectSaved(page);

    await page.goto("/");
    await expect(page.getByRole("heading", { name: "E2E 系列名" })).toBeVisible();
  });

  test("版本历史：保存追加新版本 → 恢复旧版本重新生效", async ({
    page,
  }) => {
    await login(page);
    await openSystemTab(page);
    await openSection(page, "首屏 HERO");

    const before = await versionList(page).count();

    /* 改一版保存 → 版本列表多一条，且新的一条是「当前生效」 */
    await page.getByLabel("主标题第 1 行").fill("版本 A");
    await saveButton(page).click();
    await expectSaved(page);

    await expect(versionList(page)).toHaveCount(before + 1);
    await expect(
      versionList(page).first().getByText("当前生效"),
    ).toBeVisible();
    await expect(versionList(page).first()).toContainText("版本 A");

    /* 再改一版（基于刚发的版本 A） */
    await page.getByLabel("主标题第 1 行").fill("版本 B");
    await saveButton(page).click();
    await expectSaved(page);
    await expect(versionList(page).first()).toContainText("版本 B");

    /* 回到更早的版本 A：点它的「编辑」→ 草稿变成版本 A 的内容 */
    const versionA = versionList(page).filter({ hasText: "版本 A" }).first();
    await versionA.getByRole("button", { name: /^编辑版本/ }).click();
    await expect(page.getByLabel("主标题第 1 行")).toHaveValue("版本 A");

    /* 点「恢复」→ 二次确认 → 旧版本内容原样重新生效 */
    await versionA.getByRole("button", { name: /^恢复版本/ }).click();
    await expect(page.getByText("恢复该历史版本")).toBeVisible();
    await page.getByRole("button", { name: "恢复并发布" }).click();

    /* 新的一条版本成为当前生效，内容回到版本 A */
    await expect(versionList(page).first().getByText("当前生效")).toBeVisible();
    await expect(versionList(page).first()).toContainText("版本 A");
    await expect(page.getByLabel("主标题第 1 行")).toHaveValue("版本 A");

    /* 首页也跟着回落 */
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /版本 A/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /版本 B/ })).toHaveCount(0);
  });
});
