import { test, expect } from "@playwright/test";

test.describe("Add Article Functionality", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the main page before each test
    await page.goto("/");

    // Wait for the page to be fully loaded
    await page.waitForLoadState("networkidle");
  });

  test("should open add article dialog when FAB is clicked", async ({ page }) => {
    // Find and click the add article FAB
    const addFab = page
      .locator('.MuiFab-root, button[aria-label*="add"], button:has(.MuiSvgIcon-root)')
      .first();
    await expect(addFab).toBeVisible();

    await addFab.click();

    // Wait for dialog to appear
    const dialog = page.locator('.MuiDialog-root, [role="dialog"]');
    await expect(dialog.first()).toBeVisible({ timeout: 5000 });

    // Check that dialog has a title
    const dialogTitle = page.locator(
      '.MuiDialogTitle-root, [role="dialog"] h2, [role="dialog"] h3'
    );
    await expect(dialogTitle.first()).toBeVisible();
  });

  test("should have URL input field in add article dialog", async ({ page }) => {
    // Open the add article dialog
    const addFab = page
      .locator('.MuiFab-root, button[aria-label*="add"], button:has(.MuiSvgIcon-root)')
      .first();
    await addFab.click();

    // Wait for dialog
    const dialog = page.locator('.MuiDialog-root, [role="dialog"]');
    await expect(dialog.first()).toBeVisible({ timeout: 5000 });

    // Look for URL input field
    const urlInput = page.locator(
      'input[type="url"], input[placeholder*="url"], input[name*="url"], textarea[placeholder*="url"]'
    );
    await expect(urlInput.first()).toBeVisible();

    // Check that it's focused or focusable
    await expect(urlInput.first()).toBeEnabled();
  });

  test("should have submit button in add article dialog", async ({ page }) => {
    // Open the add article dialog
    const addFab = page
      .locator('.MuiFab-root, button[aria-label*="add"], button:has(.MuiSvgIcon-root)')
      .first();
    await addFab.click();

    // Wait for dialog
    const dialog = page.locator('.MuiDialog-root, [role="dialog"]');
    await expect(dialog.first()).toBeVisible({ timeout: 5000 });

    // Look for submit button
    const submitButton = page.locator(
      'button[type="submit"], button:has-text("Add"), button:has-text("Save"), button:has-text("Submit")'
    );
    await expect(submitButton.first()).toBeVisible();

    // Check that it's enabled
    await expect(submitButton.first()).toBeEnabled();
  });

  test("should close dialog when cancel is clicked", async ({ page }) => {
    // Open the add article dialog
    const addFab = page
      .locator('.MuiFab-root, button[aria-label*="add"], button:has(.MuiSvgIcon-root)')
      .first();
    await addFab.click();

    // Wait for dialog
    const dialog = page.locator('.MuiDialog-root, [role="dialog"]');
    await expect(dialog.first()).toBeVisible({ timeout: 5000 });

    // Look for cancel button
    const cancelButton = page.locator(
      'button:has-text("Cancel"), button:has-text("Close"), button[aria-label*="close"]'
    );

    if ((await cancelButton.count()) > 0) {
      await cancelButton.first().click();

      // Dialog should be hidden
      await expect(dialog.first()).not.toBeVisible({ timeout: 3000 });
    }
  });

  test("should close dialog when clicking outside", async ({ page }) => {
    // Open the add article dialog
    const addFab = page
      .locator('.MuiFab-root, button[aria-label*="add"], button:has(.MuiSvgIcon-root)')
      .first();
    await addFab.click();

    // Wait for dialog
    const dialog = page.locator('.MuiDialog-root, [role="dialog"]');
    await expect(dialog.first()).toBeVisible({ timeout: 5000 });

    // Click outside the dialog (on the backdrop or page)
    await page.mouse.click(10, 10);

    // Dialog should be hidden
    await expect(dialog.first()).not.toBeVisible({ timeout: 3000 });
  });

  test("should validate URL input", async ({ page }) => {
    // Open the add article dialog
    const addFab = page
      .locator('.MuiFab-root, button[aria-label*="add"], button:has(.MuiSvgIcon-root)')
      .first();
    await addFab.click();

    // Wait for dialog
    const dialog = page.locator('.MuiDialog-root, [role="dialog"]');
    await expect(dialog.first()).toBeVisible({ timeout: 5000 });

    // Find URL input
    const urlInput = page
      .locator(
        'input[type="url"], input[placeholder*="url"], input[name*="url"], textarea[placeholder*="url"]'
      )
      .first();

    // Try to submit with invalid URL
    const submitButton = page
      .locator(
        'button[type="submit"], button:has-text("Add"), button:has-text("Save"), button:has-text("Submit")'
      )
      .first();

    // Enter invalid URL
    await urlInput.fill("not-a-valid-url");

    // Try to submit
    await submitButton.click();

    // Should show validation error or prevent submission
    // Look for error message or check that dialog is still open
    await expect(dialog.first()).toBeVisible();
  });

  test("should accept valid URL format", async ({ page }) => {
    // Open the add article dialog
    const addFab = page
      .locator('.MuiFab-root, button[aria-label*="add"], button:has(.MuiSvgIcon-root)')
      .first();
    await addFab.click();

    // Wait for dialog
    const dialog = page.locator('.MuiDialog-root, [role="dialog"]');
    await expect(dialog.first()).toBeVisible({ timeout: 5000 });

    // Find URL input
    const urlInput = page
      .locator(
        'input[type="url"], input[placeholder*="url"], input[name*="url"], textarea[placeholder*="url"]'
      )
      .first();

    // Enter valid URL
    await urlInput.fill("https://example.com/article");

    // Check that the input accepts the value
    await expect(urlInput).toHaveValue("https://example.com/article");
  });
});
