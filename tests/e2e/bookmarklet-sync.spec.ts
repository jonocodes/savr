import { test, expect } from "@playwright/test";
import {
  connectToRemoteStorage,
  waitForRemoteStorageSync,
  waitForOutgoingSync,
  getArticleFromDB,
  getArticleFromServer,
  verifyArticleFilesOnServer,
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

test.describe("Bookmarklet Server Sync", () => {
  // Bookmarklet tests involve sync operations which can take time
  test.setTimeout(120000); // 2 minutes

  test.beforeEach(async ({ page }) => {
    // First, set up RemoteStorage connection on the main page
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

    // Clear all articles from server
    await clearAllArticles(page);
  });

  test("should sync article to remote server before bookmarklet window closes", async ({
    page,
  }) => {
    const testArticleUrl = `${getContentServerUrl()}/input/death-by-a-thousand-cuts/`;

    // 1. Fetch the test article HTML (simulating what bookmarklet-client.js does)
    console.log("1️⃣  Fetching test article HTML...");
    const htmlResponse = await page.request.get(testArticleUrl);
    const testHtml = await htmlResponse.text();
    expect(testHtml).toContain("Nix");
    console.log("✅ Test HTML fetched, length:", testHtml.length);

    // 2. Navigate to app with bookmarklet parameter (simulating bookmarklet trigger)
    console.log("2️⃣  Opening app with bookmarklet parameter...");
    const bookmarkletUrl = `/?bookmarklet=${encodeURIComponent(testArticleUrl)}`;
    await page.goto(bookmarkletUrl);
    await page.waitForLoadState("networkidle");

    // Wait for RemoteStorage to be initialized
    await page.waitForFunction(
      () => !!(window as unknown as { remoteStorage: unknown }).remoteStorage,
      { timeout: 10000 }
    );
    console.log("✅ App opened with bookmarklet parameter");

    // 3. Verify the ingestion dialog appears
    console.log("3️⃣  Verifying ingestion dialog...");
    const dialog = page.locator('.MuiDialog-root, [role="dialog"]');
    await expect(dialog.first()).toBeVisible({ timeout: 10000 });
    console.log("✅ Ingestion dialog visible");

    // 4. Send postMessage with HTML (simulating bookmarklet-client.js)
    console.log("4️⃣  Sending HTML via postMessage (simulating bookmarklet client)...");
    await page.evaluate(
      ({ html, url }) => {
        window.postMessage({ action: "savr-html", html, url }, window.location.origin);
      },
      { html: testHtml, url: testArticleUrl }
    );
    console.log("✅ postMessage sent");

    // 5. Wait for ingestion to complete (dialog should close or show syncing status)
    console.log("5️⃣  Waiting for ingestion to complete...");

    // Wait for "Syncing" status to appear (indicates ingestion is done, sync is starting)
    await expect(page.getByText(/Syncing/i)).toBeVisible({ timeout: 60000 });
    console.log("✅ Ingestion complete, sync started");

    // 6. Verify article is in local IndexedDB
    console.log("6️⃣  Verifying article in local IndexedDB...");
    const localArticle = await getArticleFromDB(page, "death-by-a-thousand-cuts");
    expect(localArticle).toBeTruthy();
    expect(localArticle?.slug).toBe("death-by-a-thousand-cuts");
    expect(localArticle?.ingestSource).toBe("bookmarklet");
    console.log("✅ Article in IndexedDB with ingestSource:", localArticle?.ingestSource);

    // 7. Wait for sync to complete (this is what waitForSyncThenClose does)
    console.log("7️⃣  Waiting for sync to complete (simulating waitForSyncThenClose)...");
    await waitForOutgoingSync(page);
    // Add the same buffer as waitForSyncThenClose (500ms)
    await page.waitForTimeout(500);
    console.log("✅ Sync completed");

    // 8. Verify article exists on remote server
    console.log("8️⃣  Verifying article persists on remote server...");
    const serverArticle = await getArticleFromServer(page, "death-by-a-thousand-cuts");
    expect(serverArticle).toBeTruthy();
    expect(serverArticle?.slug).toBe("death-by-a-thousand-cuts");
    expect(serverArticle?.title).toMatch(/Death|Nix/i);
    console.log("✅ Article verified on remote server:", serverArticle?.title);

    // 9. Verify all article files exist on server
    console.log("9️⃣  Verifying all article files on remote server...");
    const fileStatus = await verifyArticleFilesOnServer(page, "death-by-a-thousand-cuts");
    expect(fileStatus.articleJson).toBe(true);
    expect(fileStatus.indexHtml).toBe(true);
    expect(fileStatus.rawHtml).toBe(true);
    expect(fileStatus.fetchLog).toBe(true);
    console.log("✅ All article files verified on server:", fileStatus);

    console.log("\n🎉 Bookmarklet sync test completed successfully!");
    console.log("   ✓ Article ingested via bookmarklet flow");
    console.log("   ✓ Article synced to server before window would close");
    console.log("   ✓ All article files verified on server");
  });

  test("should complete sync within the 15 second timeout", async ({ page }) => {
    const testArticleUrl = `${getContentServerUrl()}/input/death-by-a-thousand-cuts/`;

    // 1. Fetch the test article HTML
    console.log("1️⃣  Fetching test article HTML...");
    const htmlResponse = await page.request.get(testArticleUrl);
    const testHtml = await htmlResponse.text();
    console.log("✅ Test HTML fetched");

    // 2. Navigate to app with bookmarklet parameter
    console.log("2️⃣  Opening app with bookmarklet parameter...");
    const bookmarkletUrl = `/?bookmarklet=${encodeURIComponent(testArticleUrl)}`;
    await page.goto(bookmarkletUrl);
    await page.waitForLoadState("networkidle");

    await page.waitForFunction(
      () => !!(window as unknown as { remoteStorage: unknown }).remoteStorage,
      { timeout: 10000 }
    );

    // Wait for dialog
    const dialog = page.locator('.MuiDialog-root, [role="dialog"]');
    await expect(dialog.first()).toBeVisible({ timeout: 10000 });
    console.log("✅ App ready");

    // 3. Record start time
    const startTime = Date.now();

    // 4. Send postMessage with HTML
    console.log("3️⃣  Sending HTML via postMessage...");
    await page.evaluate(
      ({ html, url }) => {
        window.postMessage({ action: "savr-html", html, url }, window.location.origin);
      },
      { html: testHtml, url: testArticleUrl }
    );

    // 5. Wait for sync to complete
    console.log("4️⃣  Waiting for sync to complete...");
    await waitForOutgoingSync(page, 15000); // Same timeout as waitForSyncThenClose
    await page.waitForTimeout(500); // Same buffer

    const syncTime = Date.now() - startTime;
    console.log(`✅ Sync completed in ${syncTime}ms`);

    // 6. Verify sync completed within timeout
    console.log("5️⃣  Verifying sync completed within 15 second timeout...");
    expect(syncTime).toBeLessThan(15000);
    console.log(`✅ Sync time (${syncTime}ms) is within 15 second timeout`);

    // 7. Verify article is on server
    console.log("6️⃣  Verifying article on server...");
    const serverArticle = await getArticleFromServer(page, "death-by-a-thousand-cuts");
    expect(serverArticle).toBeTruthy();
    console.log("✅ Article verified on server");

    console.log("\n🎉 Bookmarklet timeout test completed successfully!");
    console.log(`   ✓ Sync completed in ${syncTime}ms (well under 15s timeout)`);
  });

  test("should handle bookmarklet ingestion without RemoteStorage connection", async ({
    page,
  }) => {
    const testArticleUrl = `${getContentServerUrl()}/input/death-by-a-thousand-cuts/`;

    // 1. Disconnect from RemoteStorage first
    console.log("1️⃣  Disconnecting from RemoteStorage...");
    await page.evaluate(async () => {
      const rs = (window as unknown as { remoteStorage: { disconnect: () => void } }).remoteStorage;
      if (rs) {
        rs.disconnect();
      }
    });
    await page.waitForTimeout(1000);
    console.log("✅ Disconnected from RemoteStorage");

    // 2. Fetch the test article HTML
    console.log("2️⃣  Fetching test article HTML...");
    const htmlResponse = await page.request.get(testArticleUrl);
    const testHtml = await htmlResponse.text();
    console.log("✅ Test HTML fetched");

    // 3. Navigate to app with bookmarklet parameter
    console.log("3️⃣  Opening app with bookmarklet parameter (no RS connection)...");
    const bookmarkletUrl = `/?bookmarklet=${encodeURIComponent(testArticleUrl)}`;
    await page.goto(bookmarkletUrl);
    await page.waitForLoadState("networkidle");

    // Wait for dialog
    const dialog = page.locator('.MuiDialog-root, [role="dialog"]');
    await expect(dialog.first()).toBeVisible({ timeout: 10000 });
    console.log("✅ App ready (disconnected mode)");

    // 4. Send postMessage with HTML
    console.log("4️⃣  Sending HTML via postMessage...");
    await page.evaluate(
      ({ html, url }) => {
        window.postMessage({ action: "savr-html", html, url }, window.location.origin);
      },
      { html: testHtml, url: testArticleUrl }
    );

    // 5. Wait for ingestion to complete (should be faster without sync)
    console.log("5️⃣  Waiting for ingestion...");
    // Without RemoteStorage, the dialog should close quickly
    await page.waitForTimeout(3000);

    // 6. Verify article is in local IndexedDB
    console.log("6️⃣  Verifying article in local IndexedDB...");
    const localArticle = await getArticleFromDB(page, "death-by-a-thousand-cuts");
    expect(localArticle).toBeTruthy();
    expect(localArticle?.slug).toBe("death-by-a-thousand-cuts");
    console.log("✅ Article saved locally without RemoteStorage");

    console.log("\n🎉 Offline bookmarklet test completed successfully!");
    console.log("   ✓ Article ingested and saved locally");
    console.log("   ✓ Graceful handling without RemoteStorage connection");
  });

  test("should set correct ingestSource for bookmarklet-saved articles", async ({ page }) => {
    const testArticleUrl = `${getContentServerUrl()}/input/death-by-a-thousand-cuts/`;

    // 1. Fetch the test article HTML
    console.log("1️⃣  Fetching test article HTML...");
    const htmlResponse = await page.request.get(testArticleUrl);
    const testHtml = await htmlResponse.text();
    console.log("✅ Test HTML fetched");

    // 2. Navigate to app with bookmarklet parameter
    console.log("2️⃣  Opening app with bookmarklet parameter...");
    const bookmarkletUrl = `/?bookmarklet=${encodeURIComponent(testArticleUrl)}`;
    await page.goto(bookmarkletUrl);
    await page.waitForLoadState("networkidle");

    await page.waitForFunction(
      () => !!(window as unknown as { remoteStorage: unknown }).remoteStorage,
      { timeout: 10000 }
    );

    const dialog = page.locator('.MuiDialog-root, [role="dialog"]');
    await expect(dialog.first()).toBeVisible({ timeout: 10000 });

    // 3. Send postMessage with HTML
    console.log("3️⃣  Sending HTML via postMessage...");
    await page.evaluate(
      ({ html, url }) => {
        window.postMessage({ action: "savr-html", html, url }, window.location.origin);
      },
      { html: testHtml, url: testArticleUrl }
    );

    // 4. Wait for ingestion
    await expect(page.getByText(/Syncing/i)).toBeVisible({ timeout: 60000 });
    await waitForOutgoingSync(page);
    console.log("✅ Ingestion and sync complete");

    // 5. Verify ingestSource is "bookmarklet" locally
    console.log("4️⃣  Verifying ingestSource locally...");
    const localArticle = await getArticleFromDB(page, "death-by-a-thousand-cuts");
    expect(localArticle?.ingestSource).toBe("bookmarklet");
    console.log("✅ Local ingestSource:", localArticle?.ingestSource);

    // 6. Verify ingestSource is "bookmarklet" on server
    console.log("5️⃣  Verifying ingestSource on server...");
    const serverArticle = await getArticleFromServer(page, "death-by-a-thousand-cuts");
    expect(serverArticle?.ingestSource).toBe("bookmarklet");
    console.log("✅ Server ingestSource:", serverArticle?.ingestSource);

    console.log("\n🎉 ingestSource verification completed!");
    console.log("   ✓ ingestSource correctly set to 'bookmarklet'");
  });

  test.afterEach(async ({ page }) => {
    console.log("🧹 Cleaning up test article...");

    const currentUrl = page.url();
    if (!currentUrl.includes(":3002")) {
      await page.goto("/");
      await page.waitForLoadState("networkidle");
    }

    try {
      // Reconnect to RemoteStorage if disconnected
      await page.waitForFunction(
        () => !!(window as unknown as { remoteStorage: unknown }).remoteStorage,
        { timeout: 5000 }
      ).catch(() => {
        // Ignore - may not have RS
      });

      await deleteArticleFromStorage(page, "death-by-a-thousand-cuts");
      await deleteArticleFromDB(page, "death-by-a-thousand-cuts");
      console.log("✅ Cleanup completed\n");
    } catch {
      console.log("⚠️ Cleanup skipped (non-fatal)\n");
    }
  });
});
