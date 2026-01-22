import { test, expect } from "@playwright/test";
import {
  connectToRemoteStorage,
  waitForRemoteStorageSync,
  waitForOutgoingSync,
  getArticleFromDB,
  getArticleFromServer,
  verifyArticleFilesOnServer,
  clearLocalIndexedDB,
  triggerRemoteStorageSync,
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

test.describe("Article Server Persistence", () => {
  // These tests involve sync operations which can take time
  test.setTimeout(90000); // 90 seconds

  test.beforeEach(async ({ page }) => {
    // Navigate to app
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Clear all browser storage to ensure clean state
    await page.evaluate(async () => {
      // Clear IndexedDB - must properly await the deletion
      await new Promise<void>((resolve) => {
        const request = indexedDB.deleteDatabase("savrDb");
        request.onsuccess = () => resolve();
        request.onerror = () => resolve(); // Resolve anyway to avoid hanging
        request.onblocked = () => {
          console.log("Database deletion blocked, waiting...");
          setTimeout(resolve, 500);
        };
      });
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
    await connectToRemoteStorage(page, getRemoteStorageAddress(), token);

    // Wait for initial sync
    await waitForRemoteStorageSync(page);

    // Clear all articles from RemoteStorage server to ensure clean state between tests
    await clearAllArticles(page);
  });

  test("should persist article to remote server and restore after clearing local storage", async ({
    page,
  }) => {
    // 1. Add an article via the UI
    console.log("1️⃣  Adding article via UI...");
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
      .locator('input[type="url"], input[placeholder*="url"], .MuiTextField-root input')
      .first();
    const testUrl = `${getContentServerUrl()}/input/death-by-a-thousand-cuts/`;
    await urlInput.fill(testUrl);

    const saveButton = dialog.locator('button:has-text("Save")').first();
    await saveButton.click();

    await expect(dialog.first()).not.toBeVisible({ timeout: 10000 });
    console.log("✅ Dialog closed, ingestion started");

    // 2. Wait for article to appear in list
    console.log("2️⃣  Waiting for article to appear in list...");
    const articleTitle = page.getByText(/Death/i);
    await expect(articleTitle).toBeVisible({ timeout: 60000 });
    console.log("✅ Article appeared in list");

    // 3. Verify article is in local IndexedDB
    console.log("3️⃣  Verifying article in local IndexedDB...");
    const localArticle = await getArticleFromDB(page, "death-by-a-thousand-cuts");
    expect(localArticle).toBeTruthy();
    expect(localArticle?.slug).toBe("death-by-a-thousand-cuts");
    console.log("✅ Article verified in local IndexedDB:", localArticle?.title);

    // 4. Wait for sync to complete (push to server)
    console.log("4️⃣  Waiting for article to sync to remote server...");
    await waitForOutgoingSync(page);
    // Extra buffer for server processing
    await page.waitForTimeout(2000);
    console.log("✅ Sync completed");

    // 5. Verify article exists on remote server (bypassing cache)
    console.log("5️⃣  Verifying article persists on remote server...");
    const serverArticle = await getArticleFromServer(page, "death-by-a-thousand-cuts");
    expect(serverArticle).toBeTruthy();
    expect(serverArticle?.slug).toBe("death-by-a-thousand-cuts");
    expect(serverArticle?.title).toMatch(/Death/i);
    console.log("✅ Article verified on remote server:", serverArticle?.title);

    // 6. Verify all article files exist on server
    console.log("6️⃣  Verifying all article files on remote server...");
    const fileStatus = await verifyArticleFilesOnServer(page, "death-by-a-thousand-cuts");
    expect(fileStatus.articleJson).toBe(true);
    expect(fileStatus.indexHtml).toBe(true);
    expect(fileStatus.rawHtml).toBe(true);
    expect(fileStatus.fetchLog).toBe(true);
    console.log("✅ All article files verified on server:", fileStatus);

    // 7. Clear local IndexedDB (simulate fresh browser/device)
    console.log("7️⃣  Clearing local IndexedDB (simulating fresh browser)...");
    await clearLocalIndexedDB(page);

    // Verify local DB is empty
    const articleAfterClear = await getArticleFromDB(page, "death-by-a-thousand-cuts");
    expect(articleAfterClear).toBeFalsy();
    console.log("✅ Local IndexedDB cleared");

    // 8. Trigger sync from server to restore article
    console.log("8️⃣  Triggering sync to restore article from server...");
    await triggerRemoteStorageSync(page);
    // Give UI time to update
    await page.waitForTimeout(2000);
    console.log("✅ Sync triggered");

    // 9. Verify article is restored in local IndexedDB
    console.log("9️⃣  Verifying article restored from server...");
    const restoredArticle = await getArticleFromDB(page, "death-by-a-thousand-cuts");
    expect(restoredArticle).toBeTruthy();
    expect(restoredArticle?.slug).toBe("death-by-a-thousand-cuts");
    expect(restoredArticle?.title).toMatch(/Death/i);
    console.log("✅ Article restored from server:", restoredArticle?.title);

    // 10. Reload page and verify article appears in UI
    console.log("🔟 Reloading page to verify UI displays restored article...");
    await page.reload();
    await page.waitForLoadState("networkidle");

    // Wait for RemoteStorage to reinitialize
    await page.waitForFunction(
      () => !!(window as unknown as { remoteStorage: unknown }).remoteStorage,
      { timeout: 10000 }
    );
    await waitForRemoteStorageSync(page);

    const restoredTitle = page.getByText(/Death/i);
    await expect(restoredTitle).toBeVisible({ timeout: 15000 });
    console.log("✅ Article visible in UI after restore");

    console.log("\n🎉 Article server persistence test completed successfully!");
    console.log("   ✓ Article ingested and synced to server");
    console.log("   ✓ All article files verified on server");
    console.log("   ✓ Local storage cleared");
    console.log("   ✓ Article restored from server");
  });

  test("should verify article metadata integrity after server round-trip", async ({ page }) => {
    // 1. Add an article
    console.log("1️⃣  Adding article via UI...");
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
      .locator('input[type="url"], input[placeholder*="url"], .MuiTextField-root input')
      .first();
    const testUrl = `${getContentServerUrl()}/input/death-by-a-thousand-cuts/`;
    await urlInput.fill(testUrl);

    const saveButton = dialog.locator('button:has-text("Save")').first();
    await saveButton.click();

    await expect(dialog.first()).not.toBeVisible({ timeout: 10000 });

    // Wait for article to appear
    const articleTitle = page.getByText(/Death/i);
    await expect(articleTitle).toBeVisible({ timeout: 60000 });
    console.log("✅ Article added");

    // 2. Get original article metadata from local DB
    console.log("2️⃣  Capturing original article metadata...");
    const originalArticle = await getArticleFromDB(page, "death-by-a-thousand-cuts");
    expect(originalArticle).toBeTruthy();
    console.log("✅ Original metadata captured");

    // 3. Wait for sync to server
    console.log("3️⃣  Waiting for sync to server...");
    await waitForOutgoingSync(page);
    await page.waitForTimeout(2000);
    console.log("✅ Synced to server");

    // 4. Clear local and restore from server
    console.log("4️⃣  Clearing local and restoring from server...");
    await clearLocalIndexedDB(page);
    await triggerRemoteStorageSync(page);
    await page.waitForTimeout(2000);
    console.log("✅ Restored from server");

    // 5. Compare metadata integrity
    console.log("5️⃣  Verifying metadata integrity after round-trip...");
    const restoredArticle = await getArticleFromDB(page, "death-by-a-thousand-cuts");
    expect(restoredArticle).toBeTruthy();

    // Verify key metadata fields are preserved
    expect(restoredArticle?.slug).toBe(originalArticle?.slug);
    expect(restoredArticle?.title).toBe(originalArticle?.title);
    expect(restoredArticle?.state).toBe(originalArticle?.state);
    expect(restoredArticle?.siteName).toBe(originalArticle?.siteName);
    expect(restoredArticle?.ingestSource).toBe(originalArticle?.ingestSource);

    // Verify dates are preserved (compare as strings to handle serialization)
    expect(restoredArticle?.ingestDate).toBe(originalArticle?.ingestDate);

    console.log("✅ Metadata integrity verified:");
    console.log("   - slug:", restoredArticle?.slug);
    console.log("   - title:", restoredArticle?.title);
    console.log("   - state:", restoredArticle?.state);
    console.log("   - siteName:", restoredArticle?.siteName);
    console.log("   - ingestSource:", restoredArticle?.ingestSource);

    console.log("\n🎉 Metadata integrity test completed successfully!");
  });

  test.afterEach(async ({ page }) => {
    // Clean up: delete test article from RemoteStorage and IndexedDB
    console.log("🧹 Cleaning up test article...");

    // Navigate back to app if we're on an external page
    const currentUrl = page.url();
    if (!currentUrl.includes(":3002")) {
      await page.goto("/");
      await page.waitForLoadState("networkidle");
    }

    try {
      await deleteArticleFromStorage(page, "death-by-a-thousand-cuts");
      await deleteArticleFromDB(page, "death-by-a-thousand-cuts");
      console.log("✅ Cleanup completed\n");
    } catch (error) {
      console.log("⚠️ Cleanup error (non-fatal):", error);
    }
  });
});
