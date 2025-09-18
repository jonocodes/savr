import { test, expect } from "@playwright/test";

test.describe("Main Page", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the main page before each test
    await page.goto("/");

    // Wait for the page to be fully loaded
    await page.waitForLoadState("networkidle");
  });

  test("should display the main page with article list", async ({ page }) => {
    // Check that the page title is present
    await expect(page).toHaveTitle(/Savr/);

    // Check that the main content area is visible
    const mainContent = page.locator('main, [role="main"], .MuiContainer-root');
    await expect(mainContent.first()).toBeVisible();
  });

  test("should have working add article button", async ({ page }) => {
    // Look for the add article button (FAB with add icon)
    const addButton = page.locator(
      'button[aria-label*="add"], .MuiFab-root, button:has(.MuiSvgIcon-root)'
    );

    // Check that the add button is visible
    await expect(addButton.first()).toBeVisible();

    // Click the add button
    await addButton.first().click();

    // Check that a dialog or form appears
    const dialog = page.locator('.MuiDialog-root, [role="dialog"], form');
    await expect(dialog.first()).toBeVisible({ timeout: 5000 });
  });

  test("should have working article menu buttons", async ({ page }) => {
    // Look for article items (they should be present even if empty)
    const articleItems = page.locator('.MuiListItem-root, [role="listitem"], article');

    // If there are articles, test the menu functionality
    if ((await articleItems.count()) > 0) {
      // Find the first article's menu button (three dots)
      const menuButton = page
        .locator('button[aria-label*="menu"], .MuiIconButton-root:has(.MuiSvgIcon-root)')
        .first();

      if (await menuButton.isVisible()) {
        // Click the menu button
        await menuButton.click();

        // Check that a menu appears
        const menu = page.locator('.MuiMenu-root, [role="menu"]');
        await expect(menu.first()).toBeVisible({ timeout: 3000 });

        // Check for common menu items
        const menuItems = page.locator('.MuiMenuItem-root, [role="menuitem"]');
        await expect(menuItems.first()).toBeVisible();
      }
    }
  });

  test("should have working navigation elements", async ({ page }) => {
    // Check for common navigation elements
    const navElements = page.locator('nav, [role="navigation"], .MuiAppBar-root, header');

    if ((await navElements.count()) > 0) {
      await expect(navElements.first()).toBeVisible();
    }
  });

  test("should handle empty state gracefully", async ({ page }) => {
    // Check if there's an empty state message or placeholder
    const emptyState = page.locator(
      "text=No articles, text=Empty, text=Start by adding, .MuiTypography-root"
    );

    // If there are no articles, there should be some indication
    const articleCount = await page
      .locator('.MuiListItem-root, [role="listitem"], article')
      .count();

    if (articleCount === 0) {
      // Should show some empty state content
      await expect(page.locator("body")).toContainText(/add|create|start|empty|no articles/i);
    }
  });

  test("should have responsive layout", async ({ page }) => {
    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    // Check that content is still visible and accessible
    const mainContent = page.locator('main, [role="main"], .MuiContainer-root');
    await expect(mainContent.first()).toBeVisible();

    // Test desktop viewport
    await page.setViewportSize({ width: 1920, height: 1080 });

    // Content should still be visible
    await expect(mainContent.first()).toBeVisible();
  });

  test("should have working theme toggle if present", async ({ page }) => {
    // Look for theme toggle button
    const themeToggle = page.locator(
      'button[aria-label*="theme"], button[aria-label*="dark"], button[aria-label*="light"], .MuiToggleButton-root'
    );

    if ((await themeToggle.count()) > 0) {
      // Check that the theme toggle is visible
      await expect(themeToggle.first()).toBeVisible();

      // Click the theme toggle
      await themeToggle.first().click();

      // Wait a moment for theme change
      await page.waitForTimeout(1000);

      // Verify the page is still functional
      await expect(page.locator("body")).toBeVisible();
    }
  });
});
