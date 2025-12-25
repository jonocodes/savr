import { test, expect } from "@playwright/test";
import {
  connectToRemoteStorage,
  waitForRemoteStorageSync,
  getArticleFromDB,
  deleteArticleFromStorage,
  deleteArticleFromDB,
  disconnectFromRemoteStorage,
  clearAllArticles,
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

test.describe("Local Article Ingestion via RemoteStorage", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to app
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Clear all browser storage to ensure clean state
    await page.evaluate(() => {
      // Clear IndexedDB
      indexedDB.deleteDatabase("savrDb");
      // Clear localStorage
      localStorage.clear();
      // Clear sessionStorage
      sessionStorage.clear();
    });

    // Reload after clearing storage
    await page.reload();
    await page.waitForLoadState("networkidle");

    // Connect to RemoteStorage programmatically
    const token = testEnv.RS_TOKEN;
    await connectToRemoteStorage(page, "testuser@localhost:8004", token);

    // Wait for initial sync
    await waitForRemoteStorageSync(page);

    // Clear all articles from RemoteStorage server to ensure clean state between tests
    await clearAllArticles(page);
  });

  test("should verify content server is serving test article", async ({ page }) => {
    console.log("🔍 Verifying content server accessibility...");

    const testUrl = "http://localhost:8080/input/death-by-a-thousand-cuts/";

    // Navigate directly to the content server URL
    const response = await page.goto(testUrl);

    // Verify response is successful
    expect(response?.status()).toBe(200);
    console.log("✅ Content server responded with 200");

    // Verify the page contains expected content
    const pageContent = await page.content();
    expect(pageContent).toContain("Nix");
    console.log("✅ Article content contains expected text");

    // Verify we can see the title
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
    console.log("✅ Article has title:", title);

    console.log("\n🎉 Content server verification completed!\n");
  });

  test("should ingest article from local server and display it", async ({ page }) => {
    // 1. Open add article dialog
    console.log("1️⃣  Opening add article dialog...");
    const addButton = page.locator('button:has-text("Add Article")');
    await expect(addButton).toBeVisible({ timeout: 10000 });
    await addButton.click();

    // 2. Wait for dialog
    const dialog = page.locator('.MuiDialog-root, [role="dialog"]');
    await expect(dialog.first()).toBeVisible({ timeout: 5000 });
    console.log("✅ Dialog opened");

    // 3. Enter local article URL
    const urlInput = page
      .locator('input[type="url"], input[placeholder*="url"], .MuiTextField-root input')
      .first();
    const testUrl = "http://localhost:8080/input/death-by-a-thousand-cuts/";
    console.log("2️⃣  Entering URL:", testUrl);
    await urlInput.fill(testUrl);
    await expect(urlInput).toHaveValue(testUrl);

    // 4. Submit form
    console.log("3️⃣  Submitting form...");
    const saveButton = dialog.locator('button:has-text("Save")').first();
    await saveButton.click();

    // 5. Wait for dialog to close (ingestion started)
    await expect(dialog.first()).not.toBeVisible({ timeout: 10000 });
    console.log("✅ Dialog closed, ingestion started");

    // 6. Wait for article to appear in list
    // Article title from test_data/input/death-by-a-thousand-cuts/index.html
    console.log("4️⃣  Waiting for article to appear in list (this may take 30-60 seconds)...");

    // Wait for any article with "Death" in the title (more flexible matching)
    const articleTitle = page.getByText(/Death/i);
    await expect(articleTitle).toBeVisible({ timeout: 60000 });
    console.log("✅ Article appeared in list");

    // 7. Verify article was saved to IndexedDB
    console.log("5️⃣  Verifying article in IndexedDB...");
    const article = await getArticleFromDB(page, "death-by-a-thousand-cuts");
    expect(article).toBeTruthy();
    expect(article?.slug).toBe("death-by-a-thousand-cuts");
    expect(article?.title).toMatch(/Death/i);
    console.log("✅ Article verified in IndexedDB:", article?.title);

    // 8. Navigate to article page
    console.log("6️⃣  Navigating to article page...");
    await page.goto("/article/death-by-a-thousand-cuts");
    await page.waitForLoadState("networkidle");

    // 9. Verify article content is displayed
    console.log("7️⃣  Verifying article page content...");
    // Wait for article text content to appear (excluding RemoteStorage widget)
    await expect(page.getByText(/Death|Nix/i).first()).toBeVisible({ timeout: 10000 });
    console.log("✅ Article content displayed with expected text");

    console.log("\n🎉 Test completed successfully!\n");
  });

  test("should persist article after disconnect and reconnect", async ({ page }) => {
    // 1. Ingest an article first
    console.log("1️⃣  Ingesting article...");
    const addButton = page.locator('button:has-text("Add Article")');
    await expect(addButton).toBeVisible({ timeout: 10000 });
    await addButton.click();

    const dialog = page.locator('.MuiDialog-root, [role="dialog"]');
    await expect(dialog.first()).toBeVisible({ timeout: 5000 });

    const urlInput = page
      .locator('input[type="url"], input[placeholder*="url"], .MuiTextField-root input')
      .first();
    const testUrl = "http://localhost:8080/input/death-by-a-thousand-cuts/";
    await urlInput.fill(testUrl);

    const saveButton = dialog.locator('button:has-text("Save")').first();
    await saveButton.click();

    await expect(dialog.first()).not.toBeVisible({ timeout: 10000 });
    console.log("✅ Dialog closed");

    // Wait for article to appear
    const articleTitle = page.getByText(/Death/i);
    await expect(articleTitle).toBeVisible({ timeout: 60000 });
    console.log("✅ Article ingested and visible");

    // Check that article exists on RemoteStorage server before disconnect
    const articlesBeforeDisconnect = await page.evaluate(async () => {
      const client = (window as any).remoteStorageClient;
      if (!client) return "NO CLIENT";
      try {
        const listing = await client.getListing("saves/");
        return listing ? Object.keys(listing) : [];
      } catch (e) {
        return `ERROR: ${e}`;
      }
    });
    console.log("🔍 DEBUG: Articles on server BEFORE disconnect:", articlesBeforeDisconnect);

    // 2. Disconnect from RemoteStorage
    console.log("2️⃣  Disconnecting from RemoteStorage...");
    await disconnectFromRemoteStorage(page);
    console.log("✅ Disconnected from RemoteStorage");

    // Check if articles are still on server after disconnect
    const articlesAfterDisconnect = await page.evaluate(async () => {
      const client = (window as any).remoteStorageClient;
      if (!client) return "NO CLIENT (disconnected)";
      try {
        const listing = await client.getListing("saves/");
        return listing ? Object.keys(listing) : [];
      } catch (e) {
        return `ERROR: ${e}`;
      }
    });
    console.log("🔍 DEBUG: Articles on server AFTER disconnect:", articlesAfterDisconnect);

    // 3. Verify articles are still visible (they're cached locally in IndexedDB)
    console.log("3️⃣  Verifying articles still visible after disconnect (cached locally)...");
    await expect(articleTitle).toBeVisible({ timeout: 5000 });
    console.log("✅ Articles still visible after disconnect (as expected - cached locally)");

    // 4. Reconnect to RemoteStorage
    console.log("4️⃣  Reconnecting to RemoteStorage...");
    const token = testEnv.RS_TOKEN;

    // Check what's on the RemoteStorage server BEFORE reconnecting
    const articlesOnServer = await page.evaluate(async () => {
      const client = (window as any).remoteStorageClient;
      if (!client) return "NO CLIENT";
      try {
        const listing = await client.getListing("saves/");
        return listing ? Object.keys(listing) : [];
      } catch (e) {
        return `ERROR: ${e}`;
      }
    });
    console.log("🔍 DEBUG: Articles on RemoteStorage server:", articlesOnServer);

    await connectToRemoteStorage(page, "testuser@localhost:8004", token);
    await waitForRemoteStorageSync(page);
    console.log("✅ Reconnected to RemoteStorage");

    // Debug: Check if article is in IndexedDB after reconnect
    const articleAfterReconnect = await getArticleFromDB(page, "death-by-a-thousand-cuts");
    console.log(
      "🔍 DEBUG: Article in IndexedDB after reconnect?",
      articleAfterReconnect ? "YES" : "NO"
    );

    // 5. Navigate back to home to trigger article list refresh
    console.log("5️⃣  Navigating to home page to refresh list...");
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    console.log("✅ Navigated back to home");

    // 6. Verify article reappears in list
    console.log("6️⃣  Verifying article reappeared in list...");
    await expect(articleTitle).toBeVisible({ timeout: 10000 });
    console.log("✅ Article reappeared after reconnect");

    // 7. Verify article is still in IndexedDB
    console.log("7️⃣  Verifying article in IndexedDB...");
    const article = await getArticleFromDB(page, "death-by-a-thousand-cuts");
    expect(article).toBeTruthy();
    expect(article?.slug).toBe("death-by-a-thousand-cuts");
    console.log("✅ Article verified in IndexedDB:", article?.title);

    console.log("\n🎉 Disconnect/reconnect test completed successfully!\n");
  });

  test("should delete article from listing page", async ({ page }) => {
    // 1. Ingest an article first
    console.log("1️⃣  Ingesting article...");
    const addButton = page.locator('button:has-text("Add Article")');
    await expect(addButton).toBeVisible({ timeout: 10000 });
    await addButton.click();

    const dialog = page.locator('.MuiDialog-root, [role="dialog"]');
    await expect(dialog.first()).toBeVisible({ timeout: 5000 });

    const urlInput = page
      .locator('input[type="url"], input[placeholder*="url"], .MuiTextField-root input')
      .first();
    const testUrl = "http://localhost:8080/input/death-by-a-thousand-cuts/";
    await urlInput.fill(testUrl);

    const saveButton = dialog.locator('button:has-text("Save")').first();
    await saveButton.click();

    await expect(dialog.first()).not.toBeVisible({ timeout: 10000 });

    // Wait for article to appear
    const articleTitle = page.getByText(/Death/i);
    await expect(articleTitle).toBeVisible({ timeout: 60000 });
    console.log("✅ Article ingested and visible");

    // 2. Find and click menu button for the article
    console.log("2️⃣  Opening article menu...");
    const menuButton = page.getByTestId("article-menu-button").first();
    await expect(menuButton).toBeVisible({ timeout: 5000 });
    await menuButton.click();
    console.log("✅ Menu opened");

    // 3. Click delete button in the menu
    console.log("3️⃣  Clicking delete in menu...");
    const deleteMenuItem = page.getByTestId("article-menu-delete");
    await expect(deleteMenuItem).toBeVisible({ timeout: 5000 });
    await deleteMenuItem.click();

    // If there's a confirmation dialog, confirm the deletion
    const confirmButton = page.locator('button:has-text("Delete"), button:has-text("Confirm")');
    if (await confirmButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmButton.click();
    }

    console.log("✅ Delete clicked");

    // 4. Verify article is removed from listing
    console.log("4️⃣  Verifying article removed from list...");
    await expect(articleTitle).not.toBeVisible({ timeout: 10000 });
    console.log("✅ Article removed from listing");

    // 5. Verify article is deleted from IndexedDB
    console.log("5️⃣  Verifying article deleted from IndexedDB...");
    const article = await getArticleFromDB(page, "death-by-a-thousand-cuts");
    expect(article).toBeUndefined();
    console.log("✅ Article deleted from IndexedDB");

    console.log("\n🎉 Article deletion from listing page completed!\n");
  });

  test("should delete article from article page and redirect to listing", async ({ page }) => {
    // 1. Ingest an article first
    console.log("1️⃣  Ingesting article...");
    const addButton = page.locator('button:has-text("Add Article")');
    await expect(addButton).toBeVisible({ timeout: 10000 });
    await addButton.click();

    const dialog = page.locator('.MuiDialog-root, [role="dialog"]');
    await expect(dialog.first()).toBeVisible({ timeout: 5000 });

    const urlInput = page
      .locator('input[type="url"], input[placeholder*="url"], .MuiTextField-root input')
      .first();
    const testUrl = "http://localhost:8080/input/death-by-a-thousand-cuts/";
    await urlInput.fill(testUrl);

    const saveButton = dialog.locator('button:has-text("Save")').first();
    await saveButton.click();

    await expect(dialog.first()).not.toBeVisible({ timeout: 10000 });

    // Wait for article to appear
    const articleTitle = page.getByText(/Death/i);
    await expect(articleTitle).toBeVisible({ timeout: 60000 });
    console.log("✅ Article ingested and visible");

    // 2. Navigate to article page
    console.log("2️⃣  Navigating to article page...");
    await page.goto("/article/death-by-a-thousand-cuts");
    await page.waitForLoadState("networkidle");
    console.log("✅ Navigated to article page");

    // 3. Find and click delete button on article page
    console.log("3️⃣  Deleting article from article page...");
    const menuButton = page.getByTestId("article-page-menu-button");
    await expect(menuButton).toBeVisible({ timeout: 5000 });
    await menuButton.click();
    console.log("✅ Menu opened");

    const deleteMenuItem = page.getByTestId("article-page-menu-delete");
    await expect(deleteMenuItem).toBeVisible({ timeout: 5000 });
    await deleteMenuItem.click();

    // If there's a confirmation dialog, confirm the deletion
    const confirmButton = page.locator('button:has-text("Delete"), button:has-text("Confirm")');
    if (await confirmButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmButton.click();
    }

    console.log("✅ Delete clicked");

    // 4. Verify redirect to listing page
    console.log("4️⃣  Verifying redirect to listing page...");
    await page.waitForURL("/", { timeout: 10000 });
    expect(page.url()).toContain("/");
    console.log("✅ Redirected to listing page");

    // 5. Verify article is not in the listing
    console.log("5️⃣  Verifying article not in listing...");
    const articleInList = page.getByText(/Death/i);
    await expect(articleInList).not.toBeVisible({ timeout: 5000 });
    console.log("✅ Article not in listing");

    // 6. Verify article is deleted from IndexedDB
    console.log("6️⃣  Verifying article deleted from IndexedDB...");
    const article = await getArticleFromDB(page, "death-by-a-thousand-cuts");
    expect(article).toBeUndefined();
    console.log("✅ Article deleted from IndexedDB");

    console.log("\n🎉 Article deletion from article page completed!\n");
  });

  test.afterEach(async ({ page }) => {
    // Clean up: delete test article from RemoteStorage and IndexedDB
    console.log("🧹 Cleaning up test article...");

    try {
      await deleteArticleFromStorage(page, "death-by-a-thousand-cuts");
      await deleteArticleFromDB(page, "death-by-a-thousand-cuts");
      console.log("✅ Cleanup completed\n");
    } catch (error) {
      console.warn("⚠️  Cleanup failed:", error);
      // Don't fail the test if cleanup fails
    }
  });
});
