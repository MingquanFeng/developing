/**
 * 首页内容后台动态化 —— E2E 主流程
 * ------------------------------------------------------------------
 * 走真实 Chromium：admin 登录 → 系统设置 → 改首页内容 → 保存 → 回首页
 * 验证 → 重置为默认 → 验证回落。
 *
 * 这层补的是 vitest / smoke 覆盖不到的部分：**真实浏览器里的交互**
 * （折叠卡展开、input 事件、React 受控组件、ConfirmModal 点击流）。
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

/** 断言某个 section 的 editor 内出现「已保存」提示
 *
 * ⚠️ 不能用 page.getByText("已保存") —— 顶栏 shell notice 也有
 * "已保存 site，首页将自动更新"，strict mode 会报歧义。
 */
async function expectSaved(
  page: Page,
  sectionLabel: string,
): Promise<void> {
  const details = page.locator("details").filter({
    hasText: sectionLabel,
  });
  await expect(
    details.getByText("已保存", { exact: true }),
  ).toBeVisible();
}

/** 展开指定 section 的折叠卡 */
async function openSection(
  page: Page,
  label: string,
): Promise<void> {
  const details = page.locator("details").filter({
    hasText: label,
  });
  await details.first().evaluate((el) => {
    (el as HTMLDetailsElement).open = true;
  });
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
 * 用例把站点标题改了，这���用例的首页 title 断言就挂了。
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

  test("admin 登录后能进系统设置，看到 12 个 section 折叠卡", async ({
    page,
  }) => {
    await login(page);
    await openSystemTab(page);

    /* 顶层 section 卡 —— HomeContentPanel 结构是
       section > div > details。系列卡内还有 5 个子 details，
       所以不能直接数 page.locator("details")。 */
    await expect(
      page.locator(
        'section[aria-label="首页内容编辑"] > div > details',
      ),
    ).toHaveCount(12);
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
      await expect(
        page.locator("details summary").filter({ hasText: label }),
      ).toHaveCount(1);
    }
  });

  test("改 HERO 标题 → 保存 → 首页实时反映", async ({ page }) => {
    await login(page);
    await openSystemTab(page);
    await openSection(page, "首屏 HERO");

    const titleInput = page.getByLabel("主标题第 1 行");
    await expect(titleInput).toHaveValue("至静");

    await titleInput.fill("E2E 首屏");
    await page
      .locator("details")
      .filter({ hasText: "首屏 HERO" })
      .getByRole("button", { name: "保存" })
      .click();

    await expectSaved(page, "首屏 HERO");

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
    await page
      .locator("details")
      .filter({ hasText: "首屏 HERO" })
      .getByRole("button", { name: "保存" })
      .click();
    await expectSaved(page, "首屏 HERO");

    /* 点「重置为默认」→ 弹确认框 */
    await page
      .locator("details")
      .filter({ hasText: "首屏 HERO" })
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
    await page
      .locator("details")
      .filter({ hasText: "顶导航" })
      .getByRole("button", { name: "保存" })
      .click();

    /* 服务端返回 400 → UI 显示形状不符 */
    await expect(
      page
        .locator("details")
        .filter({ hasText: "顶导航" })
        .getByText(/形状不符合/),
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
    await page
      .locator("details")
      .filter({ hasText: "站点 meta" })
      .getByRole("button", { name: "保存" })
      .click();
    await expectSaved(page, "站点 meta");

    await page.goto("/");
    await expect(page).toHaveTitle("E2E 标题");
    await expect(page.locator("header").first()).toContainText("E2E 品牌");

    /* 还原，避免污染后续用例（已登录态，直接回后台即可，不用再 login） */
    await page.goto("/admin/");
    await openSystemTab(page);
    await openSection(page, "站点 meta");
    await page
      .locator("details")
      .filter({ hasText: "站点 meta" })
      .getByRole("button", { name: "重置为默认" })
      .click();
    await page.getByRole("button", { name: "重置", exact: true }).last().click();
  });

  test("改作品系列名 → 保存 → 首页 WORKS 目录反映", async ({ page }) => {
    await login(page);
    await openSystemTab(page);
    await openSection(page, "第三幕 · 作品系列");

    /* 5 组系列各一个子折叠；改第 1 组的系列名 */
    const group = page
      .locator("details")
      .filter({ hasText: "第三幕 · 作品系列" })
      .locator("details")
      .first();
    await group.evaluate((el) => {
      (el as HTMLDetailsElement).open = true;
    });

    const nameInput = page.getByLabel("第 1 组 系列名");
    await expect(nameInput).toHaveValue("上海 03:17");
    await nameInput.fill("E2E 系列名");

    await page
      .locator("details")
      .filter({ hasText: "第三幕 · 作品系列" })
      .getByRole("button", { name: "保存" })
      .click();
    await expectSaved(page, "第三幕 · 作品系列");

    await page.goto("/");
    await expect(page.getByRole("heading", { name: "E2E 系列名" })).toBeVisible();
  });
});
