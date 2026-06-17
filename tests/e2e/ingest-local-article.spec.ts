import { test, expect } from "@playwright/test";
import {
  connectToRemoteStorage,
  waitForRemoteStorageSync,
  getArticleFromDB,
  deleteArticleFromStorage,
  deleteArticleFromDB,
  disconnectFromRemoteStorage,
  clearAllArticles,
  getWorkerStorageAddress,
  getContentServerUrl,
  getWorkerToken,
} from "./utils/remotestorage-helper";
import { loadTestEnv } from "./utils/test-helpers";

const testEnv = loadTestEnv();


test.describe("Local Article Ingestion via RemoteStorage", () => {
  // Run tests serially to avoid conflicts with shared RemoteStorage state
  test.describe.configure({ mode: "serial" });
  // These tests involve article ingestion which can take 60+ seconds
  test.setTimeout(120000); // 2 minutes

  test.beforeEach(async ({ page }) => {
    // Navigate to app
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Clear all browser storage to ensure clean state
    // Use a timeout to prevent hanging if IndexedDB operations fail
    try {
      await page.evaluate(async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const db = (window as any).savrDb;
        if (db) await db.delete();
        localStorage.clear();
        sessionStorage.clear();
      });
    } catch (error) {
      console.log("Warning: Failed to clear browser storage:", error);
      // Continue anyway - the test might still work
    }

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

  test("should verify content server is serving test article", async ({ page }) => {
    console.log("🔍 Verifying content server accessibility...");

    const testUrl = `${getContentServerUrl()}/input/test-article-for-local-ingestion/`;

    // Navigate directly to the content server URL
    const response = await page.goto(testUrl);

    // Verify response is successful
    expect(response?.status()).toBe(200);
    console.log("✅ Content server responded with 200");

    // Verify the page contains expected content
    const pageContent = await page.content();
    expect(pageContent).toContain("LocalIngestion");
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
    // Use a robust locator that works both in empty state (text button) and non-empty state (icon button)
    const addButton = page.locator('button:has-text("Add Article"), button[aria-label*="add" i], button:has(.MuiSvgIcon-root)').first();
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
    const testUrl = `${getContentServerUrl()}/input/test-article-for-local-ingestion/`;
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
    // Article title from test_data/input/test-article-for-local-ingestion/index.html
    console.log("4️⃣  Waiting for article to appear in list (this may take 30-60 seconds)...");

    // Wait for any article with "Death" in the title (more flexible matching)
    const articleTitle = page.getByText("Test Article for Local Ingestion");
    await expect(articleTitle).toBeVisible({ timeout: 60000 });
    console.log("✅ Article appeared in list");

    // 7. Verify article was saved to IndexedDB
    console.log("5️⃣  Verifying article in IndexedDB...");
    const article = await getArticleFromDB(page, "test-article-for-local-ingestion");
    expect(article).toBeTruthy();
    expect(article?.slug).toBe("test-article-for-local-ingestion");
    expect(article?.title).toBe("Test Article for Local Ingestion");
    console.log("✅ Article verified in IndexedDB:", article?.title);

    // 8. Navigate to article page
    console.log("6️⃣  Navigating to article page...");
    await page.goto("/article/test-article-for-local-ingestion");
    await page.waitForLoadState("networkidle");

    // 9. Verify article content is displayed
    console.log("7️⃣  Verifying article page content...");
    // Wait for article text content to appear (excluding RemoteStorage widget)
    await expect(page.getByText("Test Article for Local Ingestion")).toBeVisible({ timeout: 10000 });
    console.log("✅ Article content displayed with expected text");

    console.log("\n🎉 Test completed successfully!\n");
  });

  // Previously skipped: Flaky locally - investigating timing issue with React/Dexie reactivity
  test("should persist article after disconnect and reconnect", async ({ page }) => {
    // 1. Ingest an article first
    console.log("1️⃣  Ingesting article...");
    const addButton = page.locator('button:has-text("Add Article"), button[aria-label*="add" i], button:has(.MuiSvgIcon-root)').first();
    await expect(addButton).toBeVisible({ timeout: 10000 });
    await addButton.click();

    const dialog = page.locator('.MuiDialog-root, [role="dialog"]');
    await expect(dialog.first()).toBeVisible({ timeout: 5000 });

    const urlInput = page
      .locator('input[type="url"], input[placeholder*="url"], .MuiTextField-root input')
      .first();
    const testUrl = `${getContentServerUrl()}/input/test-article-for-local-ingestion/`;
    await urlInput.fill(testUrl);

    const saveButton = dialog.locator('button:has-text("Save")').first();
    await saveButton.click();

    await expect(dialog.first()).not.toBeVisible({ timeout: 10000 });
    console.log("✅ Dialog closed");

    // Wait for article to appear
    const articleTitle = page.getByText("Test Article for Local Ingestion");
    await expect(articleTitle).toBeVisible({ timeout: 60000 });
    console.log("✅ Article ingested and visible");

    // Wait for article to sync to server before disconnecting
    console.log("   Waiting for sync to server...");
    await waitForRemoteStorageSync(page);
    // Extra wait to ensure sync completes
    await page.waitForTimeout(2000);
    console.log("   ✅ Sync completed");

    // 2. Disconnect from RemoteStorage
    console.log("2️⃣  Disconnecting from RemoteStorage...");
    await disconnectFromRemoteStorage(page);
    console.log("✅ Disconnected from RemoteStorage");

    // 3. Verify articles are still visible (they're cached locally in IndexedDB)
    console.log("3️⃣  Verifying articles still visible after disconnect (cached locally)...");
    await expect(articleTitle).toBeVisible({ timeout: 5000 });
    console.log("✅ Articles still visible after disconnect (as expected - cached locally)");

    // 4. Reconnect to RemoteStorage
    console.log("4️⃣  Reconnecting to RemoteStorage...");
    const token = getWorkerToken(testEnv.RS_TOKENS, test.info().workerIndex);
    await connectToRemoteStorage(page, getWorkerStorageAddress(test.info().workerIndex), token);
    await waitForRemoteStorageSync(page);
    console.log("✅ Reconnected to RemoteStorage");

    // 5. Navigate back to home to trigger article list refresh
    console.log("5️⃣  Navigating to home page to refresh list...");
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    // Wait for RemoteStorage to be initialized after page reload
    await page.waitForFunction(() => !!(window as unknown as { remoteStorage: unknown }).remoteStorage, { timeout: 10000 });
    // Wait for RemoteStorage to sync after page load
    await waitForRemoteStorageSync(page);
    console.log("✅ Navigated back to home");

    // 6. Verify article reappears in list
    console.log("6️⃣  Verifying article reappeared in list...");
    // Re-query the locator after navigation to ensure fresh lookup
    // Use specific text to avoid matching other test articles like "Test Article for Persistence"
    const articleTitleAfterReconnect = page.getByText("Test Article for Local Ingestion");
    await expect(articleTitleAfterReconnect).toBeVisible({ timeout: 15000 });
    console.log("✅ Article reappeared after reconnect");

    // 7. Verify article is still in IndexedDB
    console.log("7️⃣  Verifying article in IndexedDB...");
    const article = await getArticleFromDB(page, "test-article-for-local-ingestion");
    expect(article).toBeTruthy();
    expect(article?.slug).toBe("test-article-for-local-ingestion");
    console.log("✅ Article verified in IndexedDB:", article?.title);

    console.log("\n🎉 Disconnect/reconnect test completed successfully!\n");
  });

  // Regression test for https://github.com/remotestorage/remotestorage.js/issues/1170:
  // RS used to wipe its IndexedDB cache on disconnect, making cached articles unreadable.
  // rsPatchDisconnect.ts now suppresses that wipe.
  test("should allow reading articles after disconnecting from RemoteStorage provider", async ({
    page,
  }) => {
    // 1. Ingest an article while connected
    console.log("1️⃣  Ingesting article while connected to RemoteStorage...");

    // Ensure we're on the home page and UI is ready
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const addButton = page.locator('button:has-text("Add Article"), button[aria-label*="add" i], button:has(.MuiSvgIcon-root)').first();
    await expect(addButton).toBeVisible({ timeout: 10000 });
    await addButton.click();

    const dialog = page.locator('.MuiDialog-root, [role="dialog"]');
    await expect(dialog.first()).toBeVisible({ timeout: 5000 });

    const urlInput = page
      .locator('input[type="url"], input[placeholder*="url"], .MuiTextField-root input')
      .first();
    const testUrl = `${getContentServerUrl()}/input/test-article-for-local-ingestion/`;
    await urlInput.fill(testUrl);

    const saveButton = dialog.locator('button:has-text("Save")').first();
    await saveButton.click();

    await expect(dialog.first()).not.toBeVisible({ timeout: 10000 });

    // Wait for article to appear
    const articleTitle = page.getByText("Test Article for Local Ingestion");
    await expect(articleTitle).toBeVisible({ timeout: 60000 });
    console.log("✅ Article ingested and visible");

    // 2. Disconnect from RemoteStorage provider (like logging out)
    console.log("2️⃣  Disconnecting from RemoteStorage provider...");

    // Debug: Check what databases exist and their contents
    const dbsBeforeDisconnect = await page.evaluate(async () => {
      const dbs = await indexedDB.databases();
      return dbs.map((db) => db.name);
    });
    console.log("🔍 DEBUG: IndexedDB databases before disconnect:", dbsBeforeDisconnect);

    await disconnectFromRemoteStorage(page);
    console.log("✅ Disconnected from RemoteStorage provider");

    // Debug: Check databases after disconnect
    const dbsAfterDisconnect = await page.evaluate(async () => {
      const dbs = await indexedDB.databases();
      return dbs.map((db) => db.name);
    });
    console.log("🔍 DEBUG: IndexedDB databases after disconnect:", dbsAfterDisconnect);

    // 3. Verify article is still visible in the list (from savrDb)
    console.log("3️⃣  Verifying article still visible in list after disconnecting from provider...");
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(articleTitle).toBeVisible({ timeout: 5000 });
    console.log("✅ Article still visible in list");

    // 4. Click on the article to read it
    console.log("4️⃣  Opening article to read while disconnected from provider...");
    await articleTitle.click();
    await page.waitForLoadState("networkidle");
    console.log("✅ Navigated to article page");

    // 5. Verify article page loads with content
    console.log("5️⃣  Verifying article content is readable after disconnect...");

    // Check if RemoteStorage cache still has the file
    const cacheCheck = await page.evaluate(async () => {
      const client = (window as unknown as { remoteStorageClient?: { getFile: (path: string) => Promise<{ data?: string }> } }).remoteStorageClient;
      if (!client) return { error: "client is null" };
      try {
        const file = await client.getFile("saves/test-article-for-local-ingestion/index.html");
        return {
          hasFile: !!file,
          hasData: !!file?.data,
          dataLength: file?.data?.length || 0,
          dataType: typeof file?.data,
        };
      } catch (e) {
        return { error: String(e) };
      }
    });
    console.log("🔍 DEBUG: RemoteStorage cache check:", cacheCheck);

    const articleContent = page.locator("article, .article-content, main").first();
    await expect(articleContent).toBeVisible({ timeout: 5000 });

    // Verify the article has actual content text
    const contentText = await articleContent.textContent();
    expect(contentText).toBeTruthy();
    expect(contentText!.length).toBeGreaterThan(100); // Should have substantial content
    console.log("✅ Article content is readable while disconnected");

    // 6. Verify article is still in IndexedDB
    console.log("6️⃣  Verifying article is in IndexedDB...");
    const article = await getArticleFromDB(page, "test-article-for-local-ingestion");
    expect(article).toBeTruthy();
    expect(article?.slug).toBe("test-article-for-local-ingestion");
    console.log("✅ Article verified in IndexedDB");

    console.log("\n🎉 Reading after disconnect test completed successfully!\n");
  });

  // Regression test for the original bug where disconnecting from RemoteStorage left every
  // article on the list flagged "(content missing)". Root cause: remotestoragejs deletes
  // its entire IndexedDB cache on disconnect (https://github.com/remotestorage/remotestorage.js/issues/1170),
  // wiping every file written via storeFile() — index.html, PDFs, images, thumbnails.
  // Mitigation: rsPatchDisconnect.ts replaces the IndexedDB feature's `_rs_cleanup` so
  // disconnect only closes the DB handle and leaves cached files in place.
  test("article list should not show '(content missing)' after disconnect", async ({ page }) => {
    console.log("1️⃣  Ingesting article while connected to RemoteStorage...");
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const addButton = page
      .locator('button:has-text("Add Article"), button[aria-label*="add" i], button:has(.MuiSvgIcon-root)')
      .first();
    await expect(addButton).toBeVisible({ timeout: 10000 });
    await addButton.click();

    const dialog = page.locator('.MuiDialog-root, [role="dialog"]');
    await expect(dialog.first()).toBeVisible({ timeout: 5000 });

    const urlInput = page
      .locator('input[type="url"], input[placeholder*="url"], .MuiTextField-root input')
      .first();
    const testUrl = `${getContentServerUrl()}/input/test-article-for-local-ingestion/`;
    await urlInput.fill(testUrl);

    const saveButton = dialog.locator('button:has-text("Save")').first();
    await saveButton.click();
    await expect(dialog.first()).not.toBeVisible({ timeout: 10000 });

    const articleTitle = page.getByText("Test Article for Local Ingestion");
    await expect(articleTitle).toBeVisible({ timeout: 60000 });

    // Pre-condition: while connected, the list must NOT show "(content missing)".
    // If it does, the test setup is broken — not the bug we're checking for.
    await expect(page.getByText("(content missing)")).toHaveCount(0);
    console.log("✅ Article ingested, no '(content missing)' badge while connected");

    console.log("2️⃣  Disconnecting from RemoteStorage...");
    await disconnectFromRemoteStorage(page);

    // Reload so the list re-runs its content-exists checks against the post-disconnect
    // state of RS's local cache.
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // The metadata row should still be present (Dexie survives disconnect)...
    await expect(articleTitle).toBeVisible({ timeout: 5000 });

    // ...but it should NOT be flagged as content-missing. Today this fails because
    // RS wiped its IDB on disconnect, taking the saved index.html with it.
    console.log("3️⃣  Checking that '(content missing)' badge is not shown after disconnect...");
    await expect(page.getByText("(content missing)")).toHaveCount(0);
    console.log("✅ List does not show '(content missing)' after disconnect");
  });

  test("should delete article from listing page", async ({ page }) => {
    // 1. Ingest an article first
    console.log("1️⃣  Ingesting article...");
    const addButton = page.locator('button:has-text("Add Article"), button[aria-label*="add" i], button:has(.MuiSvgIcon-root)').first();
    await expect(addButton).toBeVisible({ timeout: 10000 });
    await addButton.click();

    const dialog = page.locator('.MuiDialog-root, [role="dialog"]');
    await expect(dialog.first()).toBeVisible({ timeout: 5000 });

    const urlInput = page
      .locator('input[type="url"], input[placeholder*="url"], .MuiTextField-root input')
      .first();
    const testUrl = `${getContentServerUrl()}/input/test-article-for-local-ingestion/`;
    await urlInput.fill(testUrl);

    const saveButton = dialog.locator('button:has-text("Save")').first();
    await saveButton.click();

    await expect(dialog.first()).not.toBeVisible({ timeout: 10000 });

    // Wait for article to appear
    const articleTitle = page.getByText("Test Article for Local Ingestion");
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
    const article = await getArticleFromDB(page, "test-article-for-local-ingestion");
    expect(article).toBeUndefined();
    console.log("✅ Article deleted from IndexedDB");

    console.log("\n🎉 Article deletion from listing page completed!\n");
  });

  test("should delete article from article page and redirect to listing", async ({ page }) => {
    // 1. Ingest an article first
    console.log("1️⃣  Ingesting article...");
    const addButton = page.locator('button:has-text("Add Article"), button[aria-label*="add" i], button:has(.MuiSvgIcon-root)').first();
    await expect(addButton).toBeVisible({ timeout: 10000 });
    await addButton.click();

    const dialog = page.locator('.MuiDialog-root, [role="dialog"]');
    await expect(dialog.first()).toBeVisible({ timeout: 5000 });

    const urlInput = page
      .locator('input[type="url"], input[placeholder*="url"], .MuiTextField-root input')
      .first();
    const testUrl = `${getContentServerUrl()}/input/test-article-for-local-ingestion/`;
    await urlInput.fill(testUrl);

    const saveButton = dialog.locator('button:has-text("Save")').first();
    await saveButton.click();

    await expect(dialog.first()).not.toBeVisible({ timeout: 10000 });

    // Wait for article to appear
    const articleTitle = page.getByText("Test Article for Local Ingestion");
    await expect(articleTitle).toBeVisible({ timeout: 60000 });
    console.log("✅ Article ingested and visible");

    // 2. Navigate to article page
    console.log("2️⃣  Navigating to article page...");
    await page.goto("/article/test-article-for-local-ingestion");
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
    const articleInList = page.getByText("Test Article for Local Ingestion");
    await expect(articleInList).not.toBeVisible({ timeout: 5000 });
    console.log("✅ Article not in listing");

    // 6. Verify article is deleted from IndexedDB
    console.log("6️⃣  Verifying article deleted from IndexedDB...");
    const article = await getArticleFromDB(page, "test-article-for-local-ingestion");
    expect(article).toBeUndefined();
    console.log("✅ Article deleted from IndexedDB");

    console.log("\n🎉 Article deletion from article page completed!\n");
  });

  test("should delete all articles from preferences page", async ({ page }) => {
    // 1. Ingest an article first
    console.log("1️⃣  Ingesting article...");
    const addButton = page.locator('button:has-text("Add Article"), button[aria-label*="add" i], button:has(.MuiSvgIcon-root)').first();
    await expect(addButton).toBeVisible({ timeout: 10000 });
    await addButton.click();

    const dialog = page.locator('.MuiDialog-root, [role="dialog"]');
    await expect(dialog.first()).toBeVisible({ timeout: 5000 });

    const urlInput = page
      .locator('input[type="url"], input[placeholder*="url"], .MuiTextField-root input')
      .first();
    const testUrl = `${getContentServerUrl()}/input/test-article-for-local-ingestion/`;
    await urlInput.fill(testUrl);

    const saveButton = dialog.locator('button:has-text("Save")').first();
    await saveButton.click();

    await expect(dialog.first()).not.toBeVisible({ timeout: 10000 });

    // Wait for article to appear
    const articleTitle = page.getByText("Test Article for Local Ingestion");
    await expect(articleTitle).toBeVisible({ timeout: 60000 });
    console.log("✅ Article ingested and visible");

    // 2. Navigate to preferences/settings page
    console.log("2️⃣  Navigating to preferences page...");
    const settingsButton = page.locator(
      'button[aria-label="Settings"], button:has-text("Settings")'
    );
    await settingsButton.click();
    await page.waitForURL(/\/prefs/);
    console.log("✅ Navigated to preferences page");

    // 3. Click "Delete All Articles" button (gated on disconnect)
    console.log("3️⃣  Clicking Delete All Articles...");
    const deleteAllButton = page.getByTestId("delete-all-articles-button");
    await expect(deleteAllButton).toBeVisible({ timeout: 5000 });
    await expect(deleteAllButton).toBeDisabled();
    await disconnectFromRemoteStorage(page);
    await expect(deleteAllButton).toBeEnabled({ timeout: 10000 });
    await deleteAllButton.click();
    console.log("✅ Delete All button clicked");

    // 4. Verify dialog text and confirm deletion
    console.log("4️⃣  Verifying dialog text and confirming deletion...");
    const deleteDialog = page.getByTestId("delete-all-articles-dialog");
    await expect(deleteDialog).toBeVisible({ timeout: 5000 });

    // Check the dialog text mentions articles (count may vary due to test data)
    const dialogText = deleteDialog.getByText(/Are you sure you want to delete all \d+ article/i);
    await expect(dialogText).toBeVisible({ timeout: 5000 });
    console.log("✅ Dialog shows delete confirmation");

    const confirmButton = page.getByTestId("confirm-delete-all-button");
    await confirmButton.click();
    console.log("✅ Deletion confirmed");

    // 5. Verify dialog closes
    console.log("5️⃣  Verifying dialog closed...");
    await expect(deleteDialog).not.toBeVisible({ timeout: 5000 });
    console.log("✅ Dialog closed");

    // 6. Navigate back to home and verify no articles in listing
    console.log("6️⃣  Navigating back to home...");
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    console.log("✅ Navigated to home");

    // 7. Verify no articles visible
    console.log("7️⃣  Verifying no articles in listing...");
    await expect(articleTitle).not.toBeVisible({ timeout: 5000 });
    const emptyMessage = page.getByText(/Start saving articles/i);
    await expect(emptyMessage).toBeVisible({ timeout: 5000 });
    console.log("✅ No articles visible in listing");

    // 8. Verify articles deleted from IndexedDB
    console.log("8️⃣  Verifying IndexedDB is empty...");
    const articleCount = await page.evaluate(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = (window as any).savrDb;
      if (!db) return 0;
      return await db.articles.count();
    });
    expect(articleCount).toBe(0);
    console.log("✅ IndexedDB is empty");

    console.log("\n🎉 Delete all articles test completed!\n");
  });

  test("should verify content server is serving PDF file", async ({ page }) => {
    console.log("🔍 Verifying PDF file is accessible on content server...");

    const testUrl = `${getContentServerUrl()}/input/sample-invoice-pdf/invoicesample.pdf`;

    // Fetch the PDF to verify it's accessible
    const response = await page.request.get(testUrl);

    // Verify response is successful
    expect(response.status()).toBe(200);
    console.log("✅ Content server responded with 200");

    // Verify content type is PDF
    const contentType = response.headers()["content-type"];
    expect(contentType).toContain("application/pdf");
    console.log("✅ Content-Type is application/pdf");

    // Verify we got actual data
    const body = await response.body();
    expect(body.length).toBeGreaterThan(1000);
    console.log("✅ PDF file has content, size:", body.length, "bytes");

    console.log("\n🎉 PDF content server verification completed!\n");
  });

  test("should ingest PDF from local server and display it in iframe", async ({ page }) => {
    // 1. Open add article dialog
    console.log("1️⃣  Opening add article dialog...");
    const addButton = page.locator('button:has-text("Add Article"), button[aria-label*="add" i], button:has(.MuiSvgIcon-root)').first();
    await expect(addButton).toBeVisible({ timeout: 10000 });
    await addButton.click();

    // 2. Wait for dialog
    const dialog = page.locator('.MuiDialog-root, [role="dialog"]');
    await expect(dialog.first()).toBeVisible({ timeout: 5000 });
    console.log("✅ Dialog opened");

    // 3. Enter local PDF URL
    const urlInput = page
      .locator('input[type="url"], input[placeholder*="url"], .MuiTextField-root input')
      .first();
    const testUrl = `${getContentServerUrl()}/input/sample-invoice-pdf/invoicesample.pdf`;
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
    console.log("4️⃣  Waiting for PDF article to appear in list...");
    // The title should be extracted from the filename: "invoicesample"
    const articleTitle = page.getByText(/invoicesample/i);
    await expect(articleTitle).toBeVisible({ timeout: 60000 });
    console.log("✅ PDF article appeared in list");

    // 7. Verify article was saved to IndexedDB with PDF mimeType
    console.log("5️⃣  Verifying article in IndexedDB...");
    const article = await getArticleFromDB(page, "invoicesample");
    expect(article).toBeTruthy();
    expect(article?.slug).toBe("invoicesample");
    expect(article?.mimeType).toBe("application/pdf");
    console.log("✅ Article verified in IndexedDB:", article?.title, "mimeType:", article?.mimeType);

    // 8. Navigate to article page
    console.log("6️⃣  Navigating to article page...");
    await page.goto("/article/invoicesample");
    await page.waitForLoadState("networkidle");

    // 9. Verify PDF is displayed in an iframe
    console.log("7️⃣  Verifying PDF is displayed in iframe...");
    const iframe = page.locator('iframe[title="invoicesample"], iframe[title="PDF Document"]');
    await expect(iframe).toBeVisible({ timeout: 10000 });
    console.log("✅ PDF iframe is visible");

    // Verify iframe has a blob URL src (indicating PDF was loaded from storage)
    const iframeSrc = await iframe.getAttribute("src");
    expect(iframeSrc).toMatch(/^blob:/);
    console.log("✅ PDF iframe has blob URL src");

    console.log("\n🎉 PDF ingestion test completed successfully!\n");
  });

  test("should verify content server is serving markdown file", async ({ page }) => {
    console.log("🔍 Verifying markdown file is accessible on content server...");

    const testUrl = `${getContentServerUrl()}/input/sample-markdown/README.md`;

    // Fetch the markdown to verify it's accessible
    const response = await page.request.get(testUrl);

    // Verify response is successful
    expect(response.status()).toBe(200);
    console.log("✅ Content server responded with 200");

    // Verify content type is text (markdown is served as text/markdown or text/plain)
    const contentType = response.headers()["content-type"];
    expect(contentType).toMatch(/text\/(markdown|plain)/);
    console.log("✅ Content-Type is text:", contentType);

    // Verify we got actual content
    const body = await response.text();
    expect(body.length).toBeGreaterThan(100);
    expect(body).toContain("#"); // Markdown typically has headers
    console.log("✅ Markdown file has content, size:", body.length, "bytes");

    console.log("\n🎉 Markdown content server verification completed!\n");
  });

  test("should ingest markdown from local server and display it", async ({ page }) => {
    // 1. Open add article dialog
    console.log("1️⃣  Opening add article dialog...");
    const addButton = page.locator('button:has-text("Add Article"), button[aria-label*="add" i], button:has(.MuiSvgIcon-root)').first();
    await expect(addButton).toBeVisible({ timeout: 10000 });
    await addButton.click();

    // 2. Wait for dialog
    const dialog = page.locator('.MuiDialog-root, [role="dialog"]');
    await expect(dialog.first()).toBeVisible({ timeout: 5000 });
    console.log("✅ Dialog opened");

    // 3. Enter local markdown URL
    const urlInput = page
      .locator('input[type="url"], input[placeholder*="url"], .MuiTextField-root input')
      .first();
    const testUrl = `${getContentServerUrl()}/input/sample-markdown/README.md`;
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
    console.log("4️⃣  Waiting for markdown article to appear in list...");
    // The title is extracted by Readability from the markdown content
    // The README.md contains "# StashCast Deployment Guide" as the first heading
    const articleTitle = page.getByText(/StashCast Deployment Guide/i);
    await expect(articleTitle.first()).toBeVisible({ timeout: 60000 });
    console.log("✅ Markdown article appeared in list");

    // 7. Verify article was saved to IndexedDB
    console.log("5️⃣  Verifying article in IndexedDB...");
    const article = await getArticleFromDB(page, "stashcast-deployment-guide");
    expect(article).toBeTruthy();
    console.log("✅ Article verified in IndexedDB:", article?.title, "mimeType:", article?.mimeType);

    console.log("\n🎉 Markdown ingestion test completed successfully!\n");
  });

  test("should verify content server is serving image file", async ({ page }) => {
    console.log("🔍 Verifying image file is accessible on content server...");

    const testUrl = `${getContentServerUrl()}/input/sample-image/header-transparent.png`;

    // Fetch the image to verify it's accessible
    const response = await page.request.get(testUrl);

    // Verify response is successful
    expect(response.status()).toBe(200);
    console.log("✅ Content server responded with 200");

    // Verify content type is image/png
    const contentType = response.headers()["content-type"];
    expect(contentType).toContain("image/png");
    console.log("✅ Content-Type is image/png");

    // Verify we got actual data
    const body = await response.body();
    expect(body.length).toBeGreaterThan(1000);
    console.log("✅ Image file has content, size:", body.length, "bytes");

    console.log("\n🎉 Image content server verification completed!\n");
  });

  test("should ingest image from local server and display it", async ({ page }) => {
    // 1. Open add article dialog
    console.log("1️⃣  Opening add article dialog...");
    const addButton = page.locator('button:has-text("Add Article"), button[aria-label*="add" i], button:has(.MuiSvgIcon-root)').first();
    await expect(addButton).toBeVisible({ timeout: 10000 });
    await addButton.click();

    // 2. Wait for dialog
    const dialog = page.locator('.MuiDialog-root, [role="dialog"]');
    await expect(dialog.first()).toBeVisible({ timeout: 5000 });
    console.log("✅ Dialog opened");

    // 3. Enter local image URL
    const urlInput = page
      .locator('input[type="url"], input[placeholder*="url"], .MuiTextField-root input')
      .first();
    const testUrl = `${getContentServerUrl()}/input/sample-image/header-transparent.png`;
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
    console.log("4️⃣  Waiting for image article to appear in list...");
    // The title should be extracted from the filename: "header transparent"
    const articleTitle = page.getByText(/header transparent/i);
    await expect(articleTitle).toBeVisible({ timeout: 60000 });
    console.log("✅ Image article appeared in list");

    // 7. Verify article was saved to IndexedDB with image mimeType
    console.log("5️⃣  Verifying article in IndexedDB...");
    const article = await getArticleFromDB(page, "header-transparent");
    expect(article).toBeTruthy();
    expect(article?.slug).toBe("header-transparent");
    expect(article?.mimeType).toBe("image/png");
    console.log("✅ Article verified in IndexedDB:", article?.title, "mimeType:", article?.mimeType);

    // 8. Navigate to article page
    console.log("6️⃣  Navigating to article page...");
    await page.goto("/article/header-transparent");
    await page.waitForLoadState("networkidle");

    // 9. Verify image is displayed
    console.log("7️⃣  Verifying image is displayed...");
    const img = page.locator('img[alt*="header transparent" i]');
    await expect(img).toBeVisible({ timeout: 10000 });
    console.log("✅ Image is visible");

    // Verify image has a blob URL src (indicating image was loaded from storage)
    const imgSrc = await img.getAttribute("src");
    expect(imgSrc).toMatch(/^blob:/);
    console.log("✅ Image has blob URL src");

    console.log("\n🎉 Image ingestion test completed successfully!\n");
  });

  test.afterEach(async ({ page }) => {
    // Clean up: delete test article from RemoteStorage and IndexedDB
    console.log("🧹 Cleaning up test articles...");

    // Navigate back to app if we're on an external page (e.g., content server)
    const currentUrl = page.url();
    if (!currentUrl.includes(":3002")) {
      await page.goto("/");
      await page.waitForLoadState("networkidle");
    }

    try {
      // Clean up HTML article
      await deleteArticleFromStorage(page, "test-article-for-local-ingestion");
      await deleteArticleFromDB(page, "test-article-for-local-ingestion");
      // Clean up PDF article
      await deleteArticleFromStorage(page, "invoicesample");
      await deleteArticleFromDB(page, "invoicesample");
      // Clean up markdown article
      await deleteArticleFromStorage(page, "stashcast-deployment-guide");
      await deleteArticleFromDB(page, "stashcast-deployment-guide");
      // Clean up image article
      await deleteArticleFromStorage(page, "header-transparent");
      await deleteArticleFromDB(page, "header-transparent");
      console.log("✅ Cleanup completed\n");
    } catch (error) {
      console.log("⚠️ Cleanup error (non-fatal):", error);
    }
  });
});
