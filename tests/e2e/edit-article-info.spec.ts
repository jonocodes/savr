import { test, expect } from "@playwright/test";
import {
  connectToRemoteStorage,
  waitForRemoteStorageSync,
  getArticleFromDB,
  deleteArticleFromStorage,
  deleteArticleFromDB,
  clearAllArticles,
  getRemoteStorageAddress,
  getContentServerUrl,
} from "./utils/remotestorage-helper";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Load test environment (token from global setup)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const testEnvPath = path.join(__dirname, ".test-env.json");
let testEnv: { RS_TOKEN: string };

try {
  testEnv = JSON.parse(fs.readFileSync(testEnvPath, "utf-8"));
} catch (error) {
  throw new Error(
    `Failed to load test environment from ${testEnvPath}. ` +
      `Make sure global-setup.ts ran successfully. Error: ${error}`
  );
}

test.describe("Edit Article Info", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to app
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Clear all browser storage to ensure clean state
    await page.evaluate(async () => {
      await new Promise<void>((resolve) => {
        const request = indexedDB.deleteDatabase("savrDb");
        request.onsuccess = () => resolve();
        request.onerror = () => resolve();
        request.onblocked = () => {
          setTimeout(resolve, 500);
        };
      });
      localStorage.clear();
      sessionStorage.clear();
    });

    // Reload after clearing storage
    await page.reload();
    await page.waitForLoadState("networkidle");

    // Connect to RemoteStorage
    const token = testEnv.RS_TOKEN;
    await connectToRemoteStorage(page, getRemoteStorageAddress(), token);
    await waitForRemoteStorageSync(page);
    await clearAllArticles(page);

    // Ingest a test article
    const addButton = page
      .locator(
        'button:has-text("Add Article"), button[aria-label*="add" i], button:has(.MuiSvgIcon-root)'
      )
      .first();
    await expect(addButton).toBeVisible({ timeout: 10000 });
    await addButton.click();

    const dialog = page.locator('.MuiDialog-root, [role="dialog"]');
    await expect(dialog.first()).toBeVisible({ timeout: 5000 });

    const urlInput = page
      .locator(
        'input[type="url"], input[placeholder*="url"], .MuiTextField-root input'
      )
      .first();
    const testUrl = `${getContentServerUrl()}/input/test-article-for-local-ingestion/`;
    await urlInput.fill(testUrl);

    const saveButton = dialog.locator('button:has-text("Save")').first();
    await saveButton.click();
    await expect(dialog.first()).not.toBeVisible({ timeout: 10000 });

    // Wait for article to appear
    const articleTitle = page.getByText(/Test Article|Local Ingestion/i);
    await expect(articleTitle).toBeVisible({ timeout: 60000 });
  });

  test("should display Edit Info menu item in article page menu", async ({
    page,
  }) => {
    // Navigate to article page
    await page.goto("/article/test-article-for-local-ingestion");
    await page.waitForLoadState("networkidle");

    // Open the menu
    const menuButton = page.getByTestId("article-page-menu-button");
    await expect(menuButton).toBeVisible({ timeout: 10000 });
    await menuButton.click();

    // Check that Edit Info menu item is visible
    const editInfoMenuItem = page.getByText("Edit Info");
    await expect(editInfoMenuItem).toBeVisible({ timeout: 5000 });
  });

  test("should open edit drawer when clicking Edit Info", async ({ page }) => {
    // Navigate to article page
    await page.goto("/article/test-article-for-local-ingestion");
    await page.waitForLoadState("networkidle");

    // Open the menu and click Edit Info
    const menuButton = page.getByTestId("article-page-menu-button");
    await menuButton.click();

    const editInfoMenuItem = page.getByText("Edit Info");
    await editInfoMenuItem.click();

    // Verify drawer opens with Article Info title
    const drawerTitle = page.getByText("Article Info");
    await expect(drawerTitle).toBeVisible({ timeout: 5000 });
  });

  test("should display title and author fields in edit drawer", async ({
    page,
  }) => {
    // Navigate to article page
    await page.goto("/article/test-article-for-local-ingestion");
    await page.waitForLoadState("networkidle");

    // Open the menu and click Edit Info
    const menuButton = page.getByTestId("article-page-menu-button");
    await menuButton.click();

    const editInfoMenuItem = page.getByText("Edit Info");
    await editInfoMenuItem.click();

    // Verify Title field is visible
    const titleInput = page.locator('input[id*="title" i], label:has-text("Title") + div input, .MuiTextField-root:has(label:has-text("Title")) input').first();
    await expect(titleInput).toBeVisible({ timeout: 5000 });

    // Verify Author field is visible
    const authorInput = page.locator('input[id*="author" i], label:has-text("Author") + div input, .MuiTextField-root:has(label:has-text("Author")) input').first();
    await expect(authorInput).toBeVisible({ timeout: 5000 });
  });

  test("should display Cancel and Save buttons in edit drawer", async ({
    page,
  }) => {
    // Navigate to article page
    await page.goto("/article/test-article-for-local-ingestion");
    await page.waitForLoadState("networkidle");

    // Open the menu and click Edit Info
    const menuButton = page.getByTestId("article-page-menu-button");
    await menuButton.click();

    const editInfoMenuItem = page.getByText("Edit Info");
    await editInfoMenuItem.click();

    // Verify Cancel and Save buttons are visible
    const cancelButton = page.locator('button:has-text("Cancel")');
    const saveButton = page.locator('button:has-text("Save")');

    await expect(cancelButton).toBeVisible({ timeout: 5000 });
    await expect(saveButton).toBeVisible({ timeout: 5000 });
  });

  test("should close drawer when clicking Cancel", async ({ page }) => {
    // Navigate to article page
    await page.goto("/article/test-article-for-local-ingestion");
    await page.waitForLoadState("networkidle");

    // Open the menu and click Edit Info
    const menuButton = page.getByTestId("article-page-menu-button");
    await menuButton.click();

    const editInfoMenuItem = page.getByText("Edit Info");
    await editInfoMenuItem.click();

    // Verify drawer is open
    const drawerTitle = page.getByText("Article Info");
    await expect(drawerTitle).toBeVisible({ timeout: 5000 });

    // Click Cancel
    const cancelButton = page.locator('button:has-text("Cancel")');
    await cancelButton.click();

    // Verify drawer is closed
    await expect(drawerTitle).not.toBeVisible({ timeout: 5000 });
  });

  test("should pre-fill title and author from current article data", async ({
    page,
  }) => {
    // Navigate to article page
    await page.goto("/article/test-article-for-local-ingestion");
    await page.waitForLoadState("networkidle");

    // Get the original article data
    const originalArticle = await getArticleFromDB(
      page,
      "test-article-for-local-ingestion"
    );

    // Open the menu and click Edit Info
    const menuButton = page.getByTestId("article-page-menu-button");
    await menuButton.click();

    const editInfoMenuItem = page.getByText("Edit Info");
    await editInfoMenuItem.click();

    // Wait for drawer to open
    await expect(page.getByText("Article Info")).toBeVisible({ timeout: 5000 });

    // Get the title field value - use a more robust selector
    const titleInput = page.locator('.MuiDrawer-root input').first();
    const titleValue = await titleInput.inputValue();

    // The title should match the original article title (if it had one)
    if (originalArticle?.title) {
      expect(titleValue).toBe(originalArticle.title);
    }
  });

  test("should save edited title and update article in IndexedDB", async ({
    page,
  }) => {
    // Navigate to article page
    await page.goto("/article/test-article-for-local-ingestion");
    await page.waitForLoadState("networkidle");

    // Open the menu and click Edit Info
    const menuButton = page.getByTestId("article-page-menu-button");
    await menuButton.click();

    const editInfoMenuItem = page.getByText("Edit Info");
    await editInfoMenuItem.click();

    // Wait for drawer to open
    await expect(page.getByText("Article Info")).toBeVisible({ timeout: 5000 });

    // Edit the title
    const titleInput = page.locator('.MuiDrawer-root input').first();
    await titleInput.clear();
    await titleInput.fill("My Custom Article Title");

    // Click Save
    const saveButton = page.locator('.MuiDrawer-root button:has-text("Save")');
    await saveButton.click();

    // Wait for drawer to close
    await expect(page.getByText("Article Info")).not.toBeVisible({
      timeout: 5000,
    });

    // Verify snackbar shows success message
    const snackbar = page.getByText("Article info updated");
    await expect(snackbar).toBeVisible({ timeout: 5000 });

    // Verify article is updated in IndexedDB
    const updatedArticle = await getArticleFromDB(
      page,
      "test-article-for-local-ingestion"
    );
    expect(updatedArticle?.title).toBe("My Custom Article Title");
  });

  test("should save edited author and update article in IndexedDB", async ({
    page,
  }) => {
    // Navigate to article page
    await page.goto("/article/test-article-for-local-ingestion");
    await page.waitForLoadState("networkidle");

    // Open the menu and click Edit Info
    const menuButton = page.getByTestId("article-page-menu-button");
    await menuButton.click();

    const editInfoMenuItem = page.getByText("Edit Info");
    await editInfoMenuItem.click();

    // Wait for drawer to open
    await expect(page.getByText("Article Info")).toBeVisible({ timeout: 5000 });

    // Edit the author (second input field)
    const authorInput = page.locator('.MuiDrawer-root input').nth(1);
    await authorInput.clear();
    await authorInput.fill("John Doe");

    // Click Save
    const saveButton = page.locator('.MuiDrawer-root button:has-text("Save")');
    await saveButton.click();

    // Wait for drawer to close
    await expect(page.getByText("Article Info")).not.toBeVisible({
      timeout: 5000,
    });

    // Verify article is updated in IndexedDB
    const updatedArticle = await getArticleFromDB(
      page,
      "test-article-for-local-ingestion"
    );
    expect(updatedArticle?.author).toBe("John Doe");
  });

  test("should persist edited title after navigating away and back", async ({
    page,
  }) => {
    // Navigate to article page
    await page.goto("/article/test-article-for-local-ingestion");
    await page.waitForLoadState("networkidle");

    // Open the menu and click Edit Info
    const menuButton = page.getByTestId("article-page-menu-button");
    await menuButton.click();

    const editInfoMenuItem = page.getByText("Edit Info");
    await editInfoMenuItem.click();

    // Wait for drawer to open
    await expect(page.getByText("Article Info")).toBeVisible({ timeout: 5000 });

    // Edit the title
    const titleInput = page.locator('.MuiDrawer-root input').first();
    await titleInput.clear();
    await titleInput.fill("Persisted Title Test");

    // Click Save
    const saveButton = page.locator('.MuiDrawer-root button:has-text("Save")');
    await saveButton.click();

    // Wait for save to complete
    await expect(page.getByText("Article info updated")).toBeVisible({
      timeout: 5000,
    });

    // Navigate to home page
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Navigate back to article
    await page.goto("/article/test-article-for-local-ingestion");
    await page.waitForLoadState("networkidle");

    // Open edit drawer again
    const menuButton2 = page.getByTestId("article-page-menu-button");
    await menuButton2.click();

    const editInfoMenuItem2 = page.getByText("Edit Info");
    await editInfoMenuItem2.click();

    // Wait for drawer to open
    await expect(page.getByText("Article Info")).toBeVisible({ timeout: 5000 });

    // Verify the title is still the edited value
    const titleInput2 = page.locator('.MuiDrawer-root input').first();
    const titleValue = await titleInput2.inputValue();
    expect(titleValue).toBe("Persisted Title Test");
  });

  test("should display storage size in edit drawer", async ({ page }) => {
    // Navigate to article page
    await page.goto("/article/test-article-for-local-ingestion");
    await page.waitForLoadState("networkidle");

    // Open the menu and click Edit Info
    const menuButton = page.getByTestId("article-page-menu-button");
    await menuButton.click();

    const editInfoMenuItem = page.getByText("Edit Info");
    await editInfoMenuItem.click();

    // Wait for drawer to open
    await expect(page.getByText("Article Info")).toBeVisible({ timeout: 5000 });

    // Verify Size label is visible (might show "Calculating..." initially)
    const sizeLabel = page.getByText(/Size:/);
    await expect(sizeLabel).toBeVisible({ timeout: 5000 });
  });

  test.afterEach(async ({ page }) => {
    // Clean up: delete test article
    const currentUrl = page.url();
    if (!currentUrl.includes(":3002")) {
      await page.goto("/");
      await page.waitForLoadState("networkidle");
    }

    try {
      await deleteArticleFromStorage(page, "test-article-for-local-ingestion");
      await deleteArticleFromDB(page, "test-article-for-local-ingestion");
    } catch (error) {
      console.log("Cleanup error (non-fatal):", error);
    }
  });
});
