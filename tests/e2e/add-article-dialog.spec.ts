import { test, expect } from "@playwright/test";

test.describe("Add Article Dialog", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the main page before each test
    await page.goto("/");

    // Wait for the page to be fully loaded
    await page.waitForLoadState("networkidle");
  });

  test("should open add article dialog when Add Article button is clicked", async ({ page }) => {
    // Find and click the Add Article button
    const addButton = page.locator('button:has-text("Add Article"), button[aria-label*="add" i], button:has(.MuiSvgIcon-root)').first();
    await expect(addButton).toBeVisible();

    await addButton.click();

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
    const addButton = page.locator('button:has-text("Add Article"), button[aria-label*="add" i], button:has(.MuiSvgIcon-root)').first();
    await addButton.click();

    // Wait for dialog
    const dialog = page.locator('.MuiDialog-root, [role="dialog"]');
    await expect(dialog.first()).toBeVisible({ timeout: 5000 });

    // Look for URL input field - Material-UI TextField with label "URL"
    const urlInput = page.locator(
      'input[aria-label="URL"], input[placeholder="URL"], .MuiTextField-root input'
    );
    await expect(urlInput.first()).toBeVisible();

    // Check that it's focused or focusable
    await expect(urlInput.first()).toBeEnabled();
  });

  test("should have save button in add article dialog", async ({ page }) => {
    // Open the add article dialog
    const addButton = page.locator('button:has-text("Add Article"), button[aria-label*="add" i], button:has(.MuiSvgIcon-root)').first();
    await addButton.click();

    // Wait for dialog
    const dialog = page.locator('.MuiDialog-root, [role="dialog"]');
    await expect(dialog.first()).toBeVisible({ timeout: 5000 });

    // Look for save button within the dialog
    const saveButton = dialog.locator('button:has-text("Save")');
    await expect(saveButton.first()).toBeVisible();

    // Check that it's enabled
    await expect(saveButton.first()).toBeEnabled();
  });

  test("should close dialog when cancel is clicked", async ({ page }) => {
    // Open the add article dialog
    const addButton = page.locator('button:has-text("Add Article"), button[aria-label*="add" i], button:has(.MuiSvgIcon-root)').first();
    await addButton.click();

    // Wait for dialog
    const dialog = page.locator('.MuiDialog-root, [role="dialog"]');
    await expect(dialog.first()).toBeVisible({ timeout: 5000 });

    // Look for cancel button
    const cancelButton = page.locator('button:has-text("Cancel")');

    if ((await cancelButton.count()) > 0) {
      await cancelButton.first().click();

      // Dialog should be hidden
      await expect(dialog.first()).not.toBeVisible({ timeout: 3000 });
    }
  });

  test("should close dialog when clicking outside", async ({ page }) => {
    // Open the add article dialog
    const addButton = page.locator('button:has-text("Add Article"), button[aria-label*="add" i], button:has(.MuiSvgIcon-root)').first();
    await addButton.click();

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
    const addButton = page.locator('button:has-text("Add Article"), button[aria-label*="add" i], button:has(.MuiSvgIcon-root)').first();
    await addButton.click();

    // Wait for dialog
    const dialog = page.locator('.MuiDialog-root, [role="dialog"]');
    await expect(dialog.first()).toBeVisible({ timeout: 5000 });

    // Find URL input
    const urlInput = page
      .locator('input[aria-label="URL"], input[placeholder="URL"], .MuiTextField-root input')
      .first();

    // Try to submit with invalid URL
    const saveButton = dialog.locator('button:has-text("Save")').first();

    // Enter invalid URL
    await urlInput.fill("not-a-valid-url");

    // Try to submit
    await saveButton.click();

    // Should show validation error or prevent submission
    // Look for error message or check that dialog is still open
    await expect(dialog.first()).toBeVisible();
  });

  test("should accept valid URL format", async ({ page }) => {
    // Open the add article dialog
    const addButton = page.locator('button:has-text("Add Article"), button[aria-label*="add" i], button:has(.MuiSvgIcon-root)').first();
    await addButton.click();

    // Wait for dialog
    const dialog = page.locator('.MuiDialog-root, [role="dialog"]');
    await expect(dialog.first()).toBeVisible({ timeout: 5000 });

    // Find URL input
    const urlInput = page
      .locator('input[aria-label="URL"], input[placeholder="URL"], .MuiTextField-root input')
      .first();

    // Enter valid URL
    await urlInput.fill("https://example.com/article");

    // Check that the input accepts the value
    await expect(urlInput).toHaveValue("https://example.com/article");
  });

  // test("should ingest CBC article and display correct title", async ({ page }) => {
  //   // Open the add article dialog
  //   const addButton = page.locator('button:has-text("Add Article"), button[aria-label*="add" i], button:has(.MuiSvgIcon-root)').first();
  //   await addButton.click();

  //   // Wait for dialog
  //   const dialog = page.locator('.MuiDialog-root, [role="dialog"]');
  //   await expect(dialog.first()).toBeVisible({ timeout: 5000 });

  //   // Find URL input and save button within the dialog
  //   const urlInput = page
  //     .locator('input[aria-label="URL"], input[placeholder="URL"], .MuiTextField-root input')
  //     .first();
  //   const saveButton = dialog.locator('button:has-text("Save")').first();

  //   // Enter the CBC article URL
  //   await urlInput.fill(
  //     "https://www.cbc.ca/news/canada/nova-scotia/1985-toyota-tercel-high-mileage-1.7597168"
  //   );

  //   // Submit the form
  //   await saveButton.click();

  //   // Wait for dialog to close (indicating submission started)
  //   await expect(dialog.first()).not.toBeVisible({ timeout: 10000 });

  //   // Wait for the article to appear in the list
  //   // Look for the article title in the list
  //   const articleTitle = page.locator(
  //     'text="This car has more than 1.2 million km on it — and it\'s still going strong"'
  //   );
  //   await expect(articleTitle).toBeVisible({ timeout: 60000 }); // 60 second timeout for ingestion

  //   // Click on the article to view it
  //   await articleTitle.click();

  //   // Wait for the article page to load
  //   await page.waitForLoadState("networkidle");

  //   // Verify the article title is displayed on the article page
  //   const articlePageTitle = page.locator("h1, h2, .article-title, .title");
  //   await expect(articlePageTitle).toContainText("This car has more than 1.2 million km on it");
  // });
});
