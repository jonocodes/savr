import { test, expect } from "@playwright/test";
import {
  connectToRemoteStorage,
  waitForRemoteStorageSync,
  waitForOutgoingSync,
  triggerRemoteStorageSync,
  getArticleFromDB,
  getWorkerStorageAddress,
  getContentServerUrl,
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
      `Make sure global-setup.ts ran successfully. Error: ${error}`,
  );
}

test.describe("Multi-Browser Archive Sync", () => {
  // These tests involve multiple browser contexts and sync operations, which take longer
  test.setTimeout(120000); // 2 minutes

  // NOTE: This test requires a working headless browser environment with React hydration support.
  // May fail in resource-constrained environments where the browser crashes during IndexedDB init.
  // Multi-browser sync depends on RemoteStorage.js properly handling multi-client sync.
  test("should sync article archive state between two browser contexts", async ({ browser }) => {
    // Create two separate browser contexts to simulate two different browsers
    console.log("🌐 Creating two browser contexts (simulating two browsers)...");
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();

    // Enable sync via cookie for both contexts
    // Note: Cookie domain must be "localhost" even in Docker mode, because
    // host.docker.internal is resolved by the Docker browser to the host's localhost
    await context1.addCookies([
      { name: "savr-sync-enabled", value: "true", domain: "localhost", path: "/" },
    ]);
    await context2.addCookies([
      { name: "savr-sync-enabled", value: "true", domain: "localhost", path: "/" },
    ]);

    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    try {
      // Setup Browser 1
      console.log("\n📱 Browser 1: Setting up...");
      await page1.goto("/");
      await page1.waitForLoadState("networkidle");
      console.log("✅ Browser 1: App loaded");

      const token = testEnv.RS_TOKENS[test.info().workerIndex];
      console.log("🔗 Browser 1: Connecting to RemoteStorage...");
      await connectToRemoteStorage(page1, getWorkerStorageAddress(test.info().workerIndex), token);
      await waitForRemoteStorageSync(page1);
      console.log("✅ Browser 1: RemoteStorage connected and synced");

      // Setup Browser 2
      console.log("\n📱 Browser 2: Setting up...");
      await page2.goto("/");
      await page2.waitForLoadState("networkidle");
      console.log("✅ Browser 2: App loaded");

      console.log("🔗 Browser 2: Connecting to RemoteStorage...");
      await connectToRemoteStorage(page2, getWorkerStorageAddress(test.info().workerIndex), token);
      await waitForRemoteStorageSync(page2);
      console.log("✅ Browser 2: RemoteStorage connected and synced");

      // Ingest article in Browser 1
      console.log("\n1️⃣  Browser 1: Ingesting article...");
      const addButton1 = page1
        .locator(
          'button:has-text("Add Article"), button[aria-label*="add" i], button:has(.MuiSvgIcon-root)',
        )
        .first();
      await expect(addButton1).toBeVisible({ timeout: 10000 });
      await addButton1.click();

      const dialog1 = page1.locator('.MuiDialog-root, [role="dialog"]');
      await expect(dialog1.first()).toBeVisible({ timeout: 5000 });

      const urlInput1 = page1
        .locator('input[type="url"], input[placeholder*="url"], .MuiTextField-root input')
        .first();
      const testUrl = `${getContentServerUrl()}/input/death-by-a-thousand-cuts/`;
      await urlInput1.fill(testUrl);

      const saveButton1 = dialog1.locator('button:has-text("Save")').first();
      await saveButton1.click();

      await expect(dialog1.first()).not.toBeVisible({ timeout: 10000 });
      console.log("✅ Browser 1: Dialog closed");

      // Wait for article to appear in Browser 1
      console.log("2️⃣  Browser 1: Waiting for article to appear...");
      const articleTitle1 = page1.getByText(/Death/i);
      await expect(articleTitle1).toBeVisible({ timeout: 60000 });
      console.log("✅ Browser 1: Article appeared in Saves list");

      // Verify article is in "unread" state in Browser 1's IndexedDB
      console.log("3️⃣  Browser 1: Verifying article state in IndexedDB...");
      const article1 = await getArticleFromDB(page1, "death-by-a-thousand-cuts");
      expect(article1).toBeTruthy();
      expect(article1?.slug).toBe("death-by-a-thousand-cuts");
      expect(article1?.state).toBe("unread");
      console.log("✅ Browser 1: Article verified as 'unread' in IndexedDB");

      // Wait for Browser 1 to sync article to server before Browser 2 tries to pull
      console.log("   Browser 1: Waiting for sync to server...");
      await waitForRemoteStorageSync(page1);
      await page1.waitForTimeout(2000);
      console.log("   ✅ Browser 1: Sync completed");

      // Sync article to Browser 2
      console.log("\n4️⃣  Browser 2: Syncing to pull article from Browser 1...");
      await triggerRemoteStorageSync(page2);
      // Give the UI time to react to the sync
      await page2.waitForTimeout(3000);

      const articleTitle2 = page2.getByText(/Death/i);
      await expect(articleTitle2).toBeVisible({ timeout: 15000 });
      console.log("✅ Browser 2: Article appeared in Saves list after sync!");

      // Verify article in Browser 2's IndexedDB
      console.log("5️⃣  Browser 2: Verifying article in IndexedDB...");
      const article2Before = await getArticleFromDB(page2, "death-by-a-thousand-cuts");
      expect(article2Before).toBeTruthy();
      expect(article2Before?.state).toBe("unread");
      console.log("✅ Browser 2: Article verified as 'unread' in IndexedDB");

      // Archive the article in Browser 1
      console.log("\n6️⃣  Browser 1: Archiving article...");

      // Find the article card and click menu
      const articleListItem1 = page1.locator(".MuiListItem-root").filter({ hasText: /Death/i });
      const menuButton1 = articleListItem1.locator(".MuiIconButton-root").last();
      await menuButton1.click();

      const archiveMenuItem1 = page1.locator('.MuiMenuItem-root:has-text("Archive")');
      await expect(archiveMenuItem1).toBeVisible({ timeout: 5000 });
      await archiveMenuItem1.click();

      // Wait for article to disappear from Saves tab in Browser 1
      await expect(articleTitle1).not.toBeVisible({ timeout: 10000 });
      console.log("✅ Browser 1: Article disappeared from Saves tab");

      // Switch to Archive tab in Browser 1 to verify it's there
      const archiveTab1 = page1.locator('button:has-text("Archive")');
      await archiveTab1.click();
      await expect(page1.getByText(/Death/i)).toBeVisible({ timeout: 5000 });
      console.log("✅ Browser 1: Article now visible in Archive tab");

      // Verify article state in Browser 1's IndexedDB
      console.log("7️⃣  Browser 1: Verifying article state in IndexedDB...");
      const article1After = await getArticleFromDB(page1, "death-by-a-thousand-cuts");
      expect(article1After).toBeTruthy();
      expect(article1After?.state).toBe("archived");
      console.log("✅ Browser 1: Article state confirmed as 'archived' in IndexedDB");

      // Wait for Browser 1 to finish pushing the archive state to the server before
      // Browser 2 tries to pull it. waitForOutgoingSync triggers rs.sync.sync() and
      // waits for the sync-done event, which is more reliable than a fixed timeout.
      console.log("\n8️⃣  Browser 1: Waiting for archive state to reach server...");
      await waitForOutgoingSync(page1);
      console.log("✅ Browser 1: Archive state synced to server");

      console.log("   Browser 2: Pulling archive state...");


      // Trigger sync in Browser 2
      await triggerRemoteStorageSync(page2);

      // Wait for Dexie to reflect the archived state — more reliable than a fixed timeout.
      // The change handler (storage.ts) writes the new article state to Dexie via event.newValue.
      await page2.waitForFunction(
        async () => {
          const db = (window as unknown as { savrDb?: { articles: { get: (k: string) => Promise<{ state?: string } | undefined> } } }).savrDb;
          if (!db) return false;
          try {
            const article = await db.articles.get("death-by-a-thousand-cuts");
            return article?.state === "archived";
          } catch {
            return false;
          }
        },
        { timeout: 15000 }
      );

      // Article should disappear from Saves tab in Browser 2
      await expect(articleTitle2).not.toBeVisible({ timeout: 10000 });
      console.log("✅ Browser 2: Article disappeared from Saves tab after sync");

      // Verify article state in Browser 2's IndexedDB
      console.log("9️⃣  Browser 2: Verifying article state in IndexedDB...");
      const article2After = await getArticleFromDB(page2, "death-by-a-thousand-cuts");
      expect(article2After).toBeTruthy();
      expect(article2After?.state).toBe("archived");
      console.log("✅ Browser 2: Article state confirmed as 'archived' in IndexedDB");

      // Switch to Archive tab in Browser 2 to verify it's there
      const archiveTab2 = page2.locator('button:has-text("Archive")');
      await archiveTab2.click();
      await page2.waitForTimeout(500);
      await expect(page2.getByText(/Death/i)).toBeVisible({ timeout: 5000 });
      console.log("✅ Browser 2: Article now visible in Archive tab!");

      console.log("\n🎉 Multi-browser archive sync test completed successfully!");
      console.log("   ✓ Article synced from Browser 1 to Browser 2");
      console.log("   ✓ Archive state synced from Browser 1 to Browser 2");
      console.log("   ✓ Both browsers' IndexedDB and UI updated correctly");
    } finally {
      // Cleanup
      console.log("\n🧹 Cleaning up browser contexts...");
      try {
        await context1.close();
      } catch (error) {
        console.warn("⚠️  Context 1 cleanup:", error);
      }
      try {
        await context2.close();
      } catch (error) {
        console.warn("⚠️  Context 2 cleanup:", error);
      }
      console.log("✅ Cleanup completed");
    }
  });
});
