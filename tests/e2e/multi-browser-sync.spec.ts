import { test, expect, Browser } from "@playwright/test";
import {
  connectToRemoteStorage,
  waitForRemoteStorageSync,
  triggerRemoteStorageSync,
  waitForOutgoingSync,
  getArticleFromDB,
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

test.describe("Multi-Browser RemoteStorage Sync", () => {
  // These tests involve multiple browser contexts and sync operations, which take longer
  test.setTimeout(120000); // 2 minutes

  test("should sync article add and delete between two browser contexts", async ({ browser }) => {
    // Create two separate browser contexts to simulate two different browsers
    console.log("🌐 Creating two browser contexts (simulating two browsers)...");
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();

    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    try {
      // Setup Browser 1
      console.log("\n📱 Browser 1: Setting up...");
      await page1.goto("/");
      await page1.waitForLoadState("networkidle");
      console.log("✅ Browser 1: App loaded");

      const token = testEnv.RS_TOKEN;
      console.log("🔗 Browser 1: Connecting to RemoteStorage...");
      await connectToRemoteStorage(page1, getRemoteStorageAddress(), token);
      await waitForRemoteStorageSync(page1);
      console.log("✅ Browser 1: RemoteStorage connected and synced");

      // Setup Browser 2
      console.log("\n📱 Browser 2: Setting up...");
      await page2.goto("/");
      await page2.waitForLoadState("networkidle");
      console.log("✅ Browser 2: App loaded");

      console.log("🔗 Browser 2: Connecting to RemoteStorage...");
      await connectToRemoteStorage(page2, getRemoteStorageAddress(), token);
      await waitForRemoteStorageSync(page2);
      console.log("✅ Browser 2: RemoteStorage connected and synced");

      // Ingest article in Browser 1
      console.log("\n1️⃣  Browser 1: Ingesting article...");
      const addButton1 = page1.locator('button:has-text("Add Article"), button[aria-label*="add" i], button:has(.MuiSvgIcon-root)').first();
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
      console.log("✅ Browser 1: Article appeared in list");

      // Verify article in Browser 1's IndexedDB
      console.log("3️⃣  Browser 1: Verifying article in IndexedDB...");
      const article1 = await getArticleFromDB(page1, "death-by-a-thousand-cuts");
      expect(article1).toBeTruthy();
      expect(article1?.slug).toBe("death-by-a-thousand-cuts");
      console.log("✅ Browser 1: Article verified in IndexedDB:", article1?.title);

      // Wait for Browser 1 to sync article to server
      console.log("   Browser 1: Waiting for sync to server...");
      await waitForOutgoingSync(page1);
      await page1.waitForTimeout(2000);
      console.log("   ✅ Browser 1: Sync completed");

      // Trigger manual sync in Browser 2 to pull article from server
      console.log("\n4️⃣  Browser 2: Syncing to pull article from Browser 1...");
      await triggerRemoteStorageSync(page2);
      await page2.waitForTimeout(2000);

      const articleTitle2 = page2.getByText(/Death/i);
      await expect(articleTitle2).toBeVisible({ timeout: 10000 });
      console.log("✅ Browser 2: Article appeared in list after sync!");

      // Verify article in Browser 2's IndexedDB
      console.log("5️⃣  Browser 2: Verifying article in IndexedDB...");
      const article2 = await getArticleFromDB(page2, "death-by-a-thousand-cuts");
      expect(article2).toBeTruthy();
      expect(article2?.slug).toBe("death-by-a-thousand-cuts");
      expect(article2?.title).toBe(article1?.title);
      console.log("✅ Browser 2: Article verified in IndexedDB:", article2?.title);

      // Test deletion sync: Delete in Browser 1, should disappear in Browser 2
      console.log("\n6️⃣  Browser 1: Deleting article...");

      // Find the article card and click menu
      const articleListItem1 = page1.locator(".MuiListItem-root").filter({ hasText: /Death/i });
      const menuButton1 = articleListItem1.locator(".MuiIconButton-root").last();
      await menuButton1.click();

      const deleteMenuItem1 = page1.locator('.MuiMenuItem-root:has-text("Delete")');
      await expect(deleteMenuItem1).toBeVisible({ timeout: 5000 });
      await deleteMenuItem1.click();

      // Wait for article to disappear from Browser 1
      await expect(articleTitle1).not.toBeVisible({ timeout: 10000 });
      console.log("✅ Browser 1: Article deleted and disappeared from list");

      // Verify article is gone from Browser 1's IndexedDB
      console.log("7️⃣  Browser 1: Verifying article is deleted from IndexedDB...");
      const articleAfterDelete1 = await getArticleFromDB(page1, "death-by-a-thousand-cuts");
      expect(articleAfterDelete1).toBeFalsy();
      console.log("✅ Browser 1: Article confirmed deleted from IndexedDB");

      // Wait for Browser 1's deletion to be pushed to the server
      console.log("\n8️⃣  Browser 1: Waiting for deletion to sync to server...");
      await waitForOutgoingSync(page1);
      console.log("✅ Browser 1: Deletion synced to server");

      // Trigger sync in Browser 2 to pull the deletion
      console.log("9️⃣  Browser 2: Syncing to pull deletion...");
      await triggerRemoteStorageSync(page2);

      // Give change events time to process
      await page2.waitForTimeout(2000);

      await expect(articleTitle2).not.toBeVisible({ timeout: 10000 });
      console.log("✅ Browser 2: Article disappeared after deletion sync!");

      // Verify article is gone from Browser 2's IndexedDB
      console.log("🔟 Browser 2: Verifying article is deleted from IndexedDB...");
      const articleAfterDelete2 = await getArticleFromDB(page2, "death-by-a-thousand-cuts");
      expect(articleAfterDelete2).toBeFalsy();
      console.log("✅ Browser 2: Article confirmed deleted from IndexedDB");

      console.log("\n🎉 Multi-browser sync test completed successfully!");
      console.log("   ✓ Article synced from Browser 1 to Browser 2");
      console.log("   ✓ Deletion synced from Browser 1 to Browser 2");
      console.log("   ✓ Both browsers' IndexedDB updated correctly");
    } finally {
      // Cleanup
      console.log("\n🧹 Cleaning up browser contexts...");
      try {
        await context1.close();
      } catch (error) {
        // Context might already be closed
        console.warn("⚠️  Context 1 cleanup:", error);
      }
      try {
        await context2.close();
      } catch (error) {
        // Context might already be closed
        console.warn("⚠️  Context 2 cleanup:", error);
      }
      console.log("✅ Cleanup completed");
    }
  });
});
