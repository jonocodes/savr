import { test, expect } from "@playwright/test";

test.describe("Main Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test("should display the main page with article list area", async ({ page }) => {
    await expect(page).toHaveTitle(/Savr/);
    const mainContent = page.locator('main, [role="main"], .MuiContainer-root');
    await expect(mainContent.first()).toBeVisible();
  });

  test("should have a header bar", async ({ page }) => {
    const header = page.locator('.MuiPaper-root').filter({ has: page.locator('button') });
    await expect(header.first()).toBeVisible();
    await expect(page.getByText("Saves")).toBeVisible();
    await expect(page.getByText("Archive")).toBeVisible();
  });

  test("should have responsive layout", async ({ page }) => {
    const mainContent = page.locator('main, [role="main"], .MuiContainer-root');

    await page.setViewportSize({ width: 375, height: 667 });
    await expect(mainContent.first()).toBeVisible();

    await page.setViewportSize({ width: 1920, height: 1080 });
    await expect(mainContent.first()).toBeVisible();
  });
});
