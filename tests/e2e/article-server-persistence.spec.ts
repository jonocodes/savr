import { test, expect } from "@playwright/test";
import {
  connectToRemoteStorage,
  waitForRemoteStorageSync,
  waitForOutgoingSync,
  getArticleFromDB,
  getArticleFromServer,
  getArticleContentFromServer,
  verifyArticleFilesOnServer,
  clearLocalIndexedDB,
  triggerRemoteStorageSync,
  waitForArticleRestored,
  deleteArticleFromStorage,
  deleteArticleFromDB,
  clearAllArticles,
  getWorkerStorageAddress,
  getContentServerUrl,
  getWorkerToken,
} from "./utils/remotestorage-helper";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Load test environment (token from global setup)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const testEnvPath = path.join(__dirname, ".test-env.json");
let testEnv: { RS_TOKEN: string; RS_TOKENS: string[] };

try {
  testEnv = JSON.parse(fs.readFileSync(testEnvPath, "utf-8"));
} catch (error) {
  throw new Error(
    `Failed to load test environment from ${testEnvPath}. ` +
      `Make sure global-setup.ts ran successfully. Error: ${error}`
  );
}

test.describe("Article Server Persistence", () => {
  // Run tests serially to avoid conflicts with shared RemoteStorage state
  test.describe.configure({ mode: "serial" });

  // These tests involve sync operations which can take time
  test.setTimeout(90000); // 90 seconds

  test.beforeEach(async ({ page }) => {
    // Navigate to app
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Clear all browser storage to ensure clean state
    await page.evaluate(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = (window as any).savrDb;
      if (db) await db.delete();
      localStorage.clear();
      sessionStorage.clear();
    });

    // Reload after clearing storage
    await page.reload();
    await page.waitForLoadState("networkidle");

    // Connect to RemoteStorage programmatically
    const token = getWorkerToken(testEnv.RS_TOKENS, test.info().workerIndex);
    await connectToRemoteStorage(page, getWorkerStorageAddress(test.info().workerIndex), token);

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
    const testUrl = `${getContentServerUrl()}/input/test-article-for-persistence/`;
    await urlInput.fill(testUrl);

    const saveButton = dialog.locator('button:has-text("Save")').first();
    await saveButton.click();

    await expect(dialog.first()).not.toBeVisible({ timeout: 10000 });
    console.log("✅ Dialog closed, ingestion started");

    // 2. Wait for article to appear in list
    console.log("2️⃣  Waiting for article to appear in list...");
    const articleTitle = page.getByText(/Test Article for Persistence/i);
    await expect(articleTitle).toBeVisible({ timeout: 60000 });
    console.log("✅ Article appeared in list");

    // 3. Verify article is in local IndexedDB
    console.log("3️⃣  Verifying article in local IndexedDB...");
    const localArticle = await getArticleFromDB(page, "test-article-for-persistence");
    expect(localArticle).toBeTruthy();
    expect(localArticle?.slug).toBe("test-article-for-persistence");
    console.log("✅ Article verified in local IndexedDB:", localArticle?.title);

    // 4. Wait for sync to complete (push to server)
    console.log("4️⃣  Waiting for article to sync to remote server...");
    await waitForOutgoingSync(page);
    console.log("✅ Sync completed");

    // 5. Verify article exists on remote server (bypassing cache)
    console.log("5️⃣  Verifying article persists on remote server...");
    const serverArticle = await getArticleFromServer(page, "test-article-for-persistence");
    expect(serverArticle).toBeTruthy();
    expect(serverArticle?.slug).toBe("test-article-for-persistence");
    expect(serverArticle?.title).toMatch(/Test Article for Persistence/i);
    console.log("✅ Article verified on remote server:", serverArticle?.title);

    // 6. Verify all article files exist on server
    console.log("6️⃣  Verifying all article files on remote server...");
    const fileStatus = await verifyArticleFilesOnServer(page, "test-article-for-persistence");
    expect(fileStatus.articleJson).toBe(true);
    expect(fileStatus.indexHtml).toBe(true);
    expect(fileStatus.rawHtml).toBe(true);
    expect(fileStatus.fetchLog).toBe(true);
    console.log("✅ All article files verified on server:", fileStatus);

    // 7. Clear local IndexedDB (simulate fresh browser/device)
    console.log("7️⃣  Clearing local IndexedDB (simulating fresh browser)...");
    await clearLocalIndexedDB(page);

    // Verify local DB is empty
    const articleAfterClear = await getArticleFromDB(page, "test-article-for-persistence");
    expect(articleAfterClear).toBeFalsy();
    console.log("✅ Local IndexedDB cleared");

    // 8+9. Trigger sync then wait for reconcile to restore article from RS cache → Dexie
    console.log("8️⃣  Triggering sync and reconcile to restore article from server...");
    await triggerRemoteStorageSync(page);
    const restoredArticle = await waitForArticleRestored(page, "test-article-for-persistence");
    console.log("✅ Article restored from server:", restoredArticle?.title);

    // 9. Verify article is restored in local IndexedDB
    console.log("9️⃣  Verifying article restored from server...");
    expect(restoredArticle).toBeTruthy();
    expect(restoredArticle?.slug).toBe("test-article-for-persistence");
    expect(restoredArticle?.title).toMatch(/Test Article for Persistence/i);

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

    const restoredTitle = page.getByText(/Test Article for Persistence/i);
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
    const testUrl = `${getContentServerUrl()}/input/test-article-for-persistence/`;
    await urlInput.fill(testUrl);

    const saveButton = dialog.locator('button:has-text("Save")').first();
    await saveButton.click();

    await expect(dialog.first()).not.toBeVisible({ timeout: 10000 });

    // Wait for article to appear
    const articleTitle = page.getByText(/Test Article for Persistence/i);
    await expect(articleTitle).toBeVisible({ timeout: 60000 });
    console.log("✅ Article added");

    // 2. Get original article metadata from local DB
    console.log("2️⃣  Capturing original article metadata...");
    const originalArticle = await getArticleFromDB(page, "test-article-for-persistence");
    expect(originalArticle).toBeTruthy();
    console.log("✅ Original metadata captured");

    // 3. Wait for sync to server
    console.log("3️⃣  Waiting for sync to server...");
    await waitForOutgoingSync(page);
    console.log("✅ Synced to server");

    // 4. Clear local and restore from server
    console.log("4️⃣  Clearing local and restoring from server...");
    await clearLocalIndexedDB(page);
    await triggerRemoteStorageSync(page);

    // 5. Compare metadata integrity
    console.log("5️⃣  Verifying metadata integrity after round-trip...");
    const restoredArticle = await waitForArticleRestored(page, "test-article-for-persistence");
    console.log("✅ Article restored from server");
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

  test("should delete article from remote server when deleted locally", async ({ page }) => {
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
    const testUrl = `${getContentServerUrl()}/input/test-article-for-persistence/`;
    await urlInput.fill(testUrl);

    const saveButton = dialog.locator('button:has-text("Save")').first();
    await saveButton.click();

    await expect(dialog.first()).not.toBeVisible({ timeout: 10000 });

    // Wait for article to appear
    const articleTitle = page.getByText(/Test Article for Persistence/i);
    await expect(articleTitle).toBeVisible({ timeout: 60000 });
    console.log("✅ Article added");

    // 2. Wait for sync to server
    console.log("2️⃣  Waiting for sync to server...");
    await waitForOutgoingSync(page);
    console.log("✅ Synced to server");

    // 3. Verify article exists on server
    console.log("3️⃣  Verifying article exists on server...");
    const serverArticleBefore = await getArticleFromServer(page, "test-article-for-persistence");
    expect(serverArticleBefore).toBeTruthy();
    console.log("✅ Article confirmed on server");

    // 4. Delete the article via UI
    console.log("4️⃣  Deleting article via UI...");
    // Find the menu button for the specific article (not just any menu button)
    const articleListItem = page.locator('.MuiListItem-root', { hasText: 'Test Article for Persistence' });
    const menuButton = articleListItem.getByTestId("article-menu-button");
    await expect(menuButton).toBeVisible({ timeout: 5000 });
    await menuButton.click();

    const deleteMenuItem = page.getByTestId("article-menu-delete");
    await expect(deleteMenuItem).toBeVisible({ timeout: 5000 });
    await deleteMenuItem.click();

    // Handle confirmation dialog if present
    const confirmButton = page.locator('button:has-text("Delete"), button:has-text("Confirm")');
    if (await confirmButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmButton.click();
    }

    // Wait for article to disappear from UI
    await expect(articleTitle).not.toBeVisible({ timeout: 10000 });
    console.log("✅ Article deleted from UI");

    // 5. Wait for deletion to sync to server
    console.log("5️⃣  Waiting for deletion to sync to server...");
    await waitForOutgoingSync(page);
    console.log("✅ Deletion synced");

    // 6. Verify article is deleted from server
    console.log("6️⃣  Verifying article is deleted from server...");
    const serverArticleAfter = await getArticleFromServer(page, "test-article-for-persistence");
    expect(serverArticleAfter).toBeFalsy();
    console.log("✅ Article confirmed deleted from server");

    // 7. Verify all article files are deleted from server
    console.log("7️⃣  Verifying all article files are deleted from server...");
    const fileStatus = await verifyArticleFilesOnServer(page, "test-article-for-persistence");
    expect(fileStatus.articleJson).toBe(false);
    expect(fileStatus.indexHtml).toBe(false);
    expect(fileStatus.rawHtml).toBe(false);
    expect(fileStatus.fetchLog).toBe(false);
    console.log("✅ All article files confirmed deleted from server");

    console.log("\n🎉 Deletion persistence test completed successfully!");
  });

  test("should persist article archive state to remote server", async ({ page }) => {
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
    const testUrl = `${getContentServerUrl()}/input/test-article-for-persistence/`;
    await urlInput.fill(testUrl);

    const saveButton = dialog.locator('button:has-text("Save")').first();
    await saveButton.click();

    await expect(dialog.first()).not.toBeVisible({ timeout: 10000 });

    // Wait for article to appear
    const articleTitle = page.getByText(/Test Article for Persistence/i);
    await expect(articleTitle).toBeVisible({ timeout: 60000 });
    console.log("✅ Article added");

    // 2. Verify initial state is "unread"
    console.log("2️⃣  Verifying initial state is unread...");
    const initialArticle = await getArticleFromDB(page, "test-article-for-persistence");
    expect(initialArticle?.state).toBe("unread");
    console.log("✅ Initial state is unread");

    // 3. Wait for initial sync
    await waitForOutgoingSync(page);

    // 4. Archive the article via UI
    console.log("3️⃣  Archiving article via UI...");
    const menuButton = page.getByTestId("article-menu-button").first();
    await expect(menuButton).toBeVisible({ timeout: 5000 });
    await menuButton.click();

    const archiveMenuItem = page.getByTestId("article-menu-archive");
    await expect(archiveMenuItem).toBeVisible({ timeout: 5000 });
    await archiveMenuItem.click();
    console.log("✅ Archive clicked");

    // Wait for article to be archived (it should disappear from unread list or show archived state)
    await page.waitForFunction(
      async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const db = (window as any).savrDb;
        if (!db) return false;
        try {
          const a = await db.articles.get("test-article-for-persistence");
          return a?.state === "archived";
        } catch { return false; }
      },
      { timeout: 10000 },
    );

    // 5. Verify article state changed to archived locally
    console.log("4️⃣  Verifying article archived locally...");
    const archivedArticle = await getArticleFromDB(page, "test-article-for-persistence");
    expect(archivedArticle?.state).toBe("archived");
    console.log("✅ Article archived locally");

    // 6. Wait for archive state to sync to server
    console.log("5️⃣  Waiting for archive state to sync to server...");
    await waitForOutgoingSync(page);
    console.log("✅ Archive state synced");

    // 7. Verify archive state on server
    console.log("6️⃣  Verifying archive state on server...");
    const serverArticle = await getArticleFromServer(page, "test-article-for-persistence");
    expect(serverArticle?.state).toBe("archived");
    console.log("✅ Archive state confirmed on server");

    // 8. Clear local and restore from server
    console.log("7️⃣  Clearing local and restoring from server...");
    await clearLocalIndexedDB(page);
    await triggerRemoteStorageSync(page);

    // 9. Verify archive state persisted after restore
    console.log("8️⃣  Verifying archive state persisted after restore...");
    const restoredArticle = await waitForArticleRestored(page, "test-article-for-persistence");
    console.log("✅ Restored from server");
    expect(restoredArticle?.state).toBe("archived");
    console.log("✅ Archive state persisted:", restoredArticle?.state);

    console.log("\n🎉 Archive state persistence test completed successfully!");
  });

  test("should preserve article HTML content after server round-trip", async ({ page }) => {
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
    const testUrl = `${getContentServerUrl()}/input/test-article-for-persistence/`;
    await urlInput.fill(testUrl);

    const saveButton = dialog.locator('button:has-text("Save")').first();
    await saveButton.click();

    await expect(dialog.first()).not.toBeVisible({ timeout: 10000 });

    // Wait for article to appear
    const articleTitle = page.getByText(/Test Article for Persistence/i);
    await expect(articleTitle).toBeVisible({ timeout: 60000 });
    console.log("✅ Article added");

    // 2. Wait for sync to server
    console.log("2️⃣  Waiting for sync to server...");
    await waitForOutgoingSync(page);
    console.log("✅ Synced to server");

    // 3. Get the original HTML content from server
    console.log("3️⃣  Fetching original HTML content from server...");
    const originalContent = await getArticleContentFromServer(page, "test-article-for-persistence");
    expect(originalContent).toBeTruthy();
    expect(originalContent!.length).toBeGreaterThan(100);
    console.log("✅ Original content fetched, length:", originalContent!.length);

    // 4. Verify content contains expected text
    console.log("4️⃣  Verifying content contains expected text...");
    expect(originalContent).toContain("PersistenceTest");
    console.log("✅ Content contains expected text");

    // 5. Clear local and restore from server
    console.log("5️⃣  Clearing local storage...");
    await clearLocalIndexedDB(page);
    console.log("✅ Local storage cleared");

    // 6. Fetch content again from server (should still be there)
    console.log("6️⃣  Fetching content again from server...");
    const restoredContent = await getArticleContentFromServer(page, "test-article-for-persistence");
    expect(restoredContent).toBeTruthy();
    console.log("✅ Content still available on server");

    // 7. Verify content integrity
    console.log("7️⃣  Verifying content integrity...");
    expect(restoredContent).toBe(originalContent);
    console.log("✅ Content integrity verified - exact match");

    // 8. Navigate to article page and verify content renders
    console.log("8️⃣  Navigating to article page to verify rendering...");
    await triggerRemoteStorageSync(page);
    await page.goto("/article/test-article-for-persistence");
    await page.waitForLoadState("networkidle");

    // Wait for RemoteStorage to reinitialize
    await page.waitForFunction(
      () => !!(window as unknown as { remoteStorage: unknown }).remoteStorage,
      { timeout: 10000 }
    );
    await waitForRemoteStorageSync(page);

    // Verify content is displayed
    const articleContent = page.getByTestId("article-content");
    await expect(articleContent).toBeVisible({ timeout: 10000 });
    const displayedText = await articleContent.textContent();
    expect(displayedText).toContain("PersistenceTest");
    console.log("✅ Article content renders correctly");

    console.log("\n🎉 Content integrity test completed successfully!");
  });

  test("should persist multiple articles to remote server", async ({ page }) => {
    const testArticles = [
      {
        url: `${getContentServerUrl()}/input/test-article-for-persistence/`,
        slug: "test-article-for-persistence",
        titlePattern: /Test Article for Persistence/i,
      },
      {
        url: `${getContentServerUrl()}/input/test-article-secondary/`,
        slug: "secondary-test-article",
        titlePattern: /Secondary Test Article/i,
      },
    ];

    // 1. Add first article
    console.log("1️⃣  Adding first article...");
    let addButton = page
      .locator(
        'button:has-text("Add Article"), button[aria-label*="add" i], button:has(.MuiSvgIcon-root)'
      )
      .first();
    await expect(addButton).toBeVisible({ timeout: 10000 });
    await addButton.click();

    let dialog = page.locator('.MuiDialog-root, [role="dialog"]');
    await expect(dialog.first()).toBeVisible({ timeout: 5000 });

    let urlInput = page
      .locator('input[type="url"], input[placeholder*="url"], .MuiTextField-root input')
      .first();
    await urlInput.fill(testArticles[0].url);

    let saveButton = dialog.locator('button:has-text("Save")').first();
    await saveButton.click();

    await expect(dialog.first()).not.toBeVisible({ timeout: 10000 });

    // Wait for first article to appear
    const firstArticleTitle = page.getByText(testArticles[0].titlePattern);
    await expect(firstArticleTitle).toBeVisible({ timeout: 60000 });
    console.log("✅ First article added");

    // 2. Add second article
    console.log("2️⃣  Adding second article...");
    addButton = page
      .locator(
        'button:has-text("Add Article"), button[aria-label*="add" i], button:has(.MuiSvgIcon-root)'
      )
      .first();
    await expect(addButton).toBeVisible({ timeout: 10000 });
    await addButton.click();

    dialog = page.locator('.MuiDialog-root, [role="dialog"]');
    await expect(dialog.first()).toBeVisible({ timeout: 5000 });

    urlInput = page
      .locator('input[type="url"], input[placeholder*="url"], .MuiTextField-root input')
      .first();
    await urlInput.fill(testArticles[1].url);

    saveButton = dialog.locator('button:has-text("Save")').first();
    await saveButton.click();

    await expect(dialog.first()).not.toBeVisible({ timeout: 10000 });

    // Wait for second article to appear
    const secondArticleTitle = page.getByText(testArticles[1].titlePattern);
    await expect(secondArticleTitle).toBeVisible({ timeout: 60000 });
    console.log("✅ Second article added");

    // 3. Wait for both articles to sync to server
    console.log("3️⃣  Waiting for both articles to sync to server...");
    await waitForOutgoingSync(page);
    console.log("✅ Both articles synced");

    // 4. Verify both articles exist on server
    console.log("4️⃣  Verifying both articles exist on server...");
    for (const article of testArticles) {
      const serverArticle = await getArticleFromServer(page, article.slug);
      expect(serverArticle).toBeTruthy();
      expect(serverArticle?.slug).toBe(article.slug);
      console.log(`   ✅ ${article.slug} verified on server`);
    }
    console.log("✅ Both articles verified on server");

    // 5. Clear local IndexedDB
    console.log("5️⃣  Clearing local IndexedDB...");
    await clearLocalIndexedDB(page);

    // Verify local DB is empty
    for (const article of testArticles) {
      const localArticle = await getArticleFromDB(page, article.slug);
      expect(localArticle).toBeFalsy();
    }
    console.log("✅ Local IndexedDB cleared");

    // 6. Trigger sync + reconcile to restore both articles
    console.log("6️⃣  Triggering sync and reconcile to restore articles from server...");
    await triggerRemoteStorageSync(page);

    // 7. Verify both articles restored locally
    console.log("7️⃣  Verifying both articles restored from server...");
    for (const article of testArticles) {
      const restoredArticle = await waitForArticleRestored(page, article.slug);
      expect(restoredArticle).toBeTruthy();
      expect(restoredArticle?.slug).toBe(article.slug);
      console.log(`   ✅ ${article.slug} restored from server`);
    }
    console.log("✅ Both articles restored");

    // 8. Reload page and verify both articles appear in UI
    console.log("8️⃣  Reloading page to verify UI...");
    await page.reload();
    await page.waitForLoadState("networkidle");

    // Wait for RemoteStorage to reinitialize
    await page.waitForFunction(
      () => !!(window as unknown as { remoteStorage: unknown }).remoteStorage,
      { timeout: 10000 }
    );
    await waitForRemoteStorageSync(page);

    // Verify both articles visible
    await expect(page.getByText(testArticles[0].titlePattern)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(testArticles[1].titlePattern)).toBeVisible({ timeout: 15000 });
    console.log("✅ Both articles visible in UI");

    console.log("\n🎉 Multiple articles persistence test completed successfully!");
    console.log("   ✓ Both articles synced to server");
    console.log("   ✓ Both articles restored from server");
    console.log("   ✓ Both articles visible in UI");
  });

  test.afterEach(async ({ page }) => {
    // Clean up: delete test articles from RemoteStorage and IndexedDB
    console.log("🧹 Cleaning up test articles...");

    // Navigate back to app if we're on an external page
    const currentUrl = page.url();
    if (!currentUrl.includes(":3002")) {
      await page.goto("/");
      await page.waitForLoadState("networkidle");
    }

    // Clean up both test articles
    const testSlugs = ["test-article-for-persistence", "secondary-test-article"];
    for (const slug of testSlugs) {
      try {
        await deleteArticleFromStorage(page, slug);
        await deleteArticleFromDB(page, slug);
      } catch {
        // Non-fatal - article may not exist
      }
    }
    console.log("✅ Cleanup completed\n");
  });
});
