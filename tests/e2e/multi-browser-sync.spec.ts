import { test, expect, Browser } from "@playwright/test";
import {
  connectToRemoteStorage,
  waitForRemoteStorageSync,
  getArticleFromDB,
  deleteArticleFromStorage,
  deleteArticleFromDB,
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
  test("should sync article between two browser contexts", async ({ browser }) => {
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
      await connectToRemoteStorage(page1, "testuser@127.0.0.1:8004", token);
      await waitForRemoteStorageSync(page1);
      console.log("✅ Browser 1: RemoteStorage connected and synced");

      // Setup Browser 2
      console.log("\n📱 Browser 2: Setting up...");
      await page2.goto("/");
      await page2.waitForLoadState("networkidle");
      console.log("✅ Browser 2: App loaded");

      console.log("🔗 Browser 2: Connecting to RemoteStorage...");
      await connectToRemoteStorage(page2, "testuser@127.0.0.1:8004", token);
      await waitForRemoteStorageSync(page2);
      console.log("✅ Browser 2: RemoteStorage connected and synced");

      // Ingest article in Browser 1
      console.log("\n1️⃣  Browser 1: Ingesting article...");
      const addButton1 = page1.locator('button:has-text("Add Article")');
      await expect(addButton1).toBeVisible({ timeout: 10000 });
      await addButton1.click();

      const dialog1 = page1.locator('.MuiDialog-root, [role="dialog"]');
      await expect(dialog1.first()).toBeVisible({ timeout: 5000 });

      const urlInput1 = page1
        .locator('input[type="url"], input[placeholder*="url"], .MuiTextField-root input')
        .first();
      const testUrl = "http://127.0.0.1:8080/input/death-by-a-thousand-cuts/";
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

      // Wait for article to sync to Browser 2
      // The change event should trigger automatically, but we'll wait for the article to appear
      console.log("\n4️⃣  Browser 2: Waiting for article to sync from Browser 1...");
      console.log("    (This should happen automatically via RemoteStorage change events)");

      const articleTitle2 = page2.getByText(/Death/i);

      // Wait up to 30 seconds for the article to appear in Browser 2
      // The change event should fire and trigger a database rebuild
      await expect(articleTitle2).toBeVisible({ timeout: 30000 });
      console.log("✅ Browser 2: Article appeared in list after sync!");

      // Verify article in Browser 2's IndexedDB
      console.log("5️⃣  Browser 2: Verifying article in IndexedDB...");
      const article2 = await getArticleFromDB(page2, "death-by-a-thousand-cuts");
      expect(article2).toBeTruthy();
      expect(article2?.slug).toBe("death-by-a-thousand-cuts");
      expect(article2?.title).toBe(article1?.title);
      console.log("✅ Browser 2: Article verified in IndexedDB:", article2?.title);

      // Test deletion sync: Delete in Browser 2, should disappear in Browser 1
      console.log("\n6️⃣  Browser 2: Deleting article...");

      // Click on the article menu and delete
      const articleCard2 = page2.locator('[data-testid="article-card"]').filter({ hasText: /Death/i });
      const menuButton2 = articleCard2.locator('button[aria-label="Article menu"]');
      await menuButton2.click();

      const deleteMenuItem2 = page2.locator('li:has-text("Delete")');
      await expect(deleteMenuItem2).toBeVisible({ timeout: 5000 });
      await deleteMenuItem2.click();

      // Wait for article to disappear from Browser 2
      await expect(articleTitle2).not.toBeVisible({ timeout: 10000 });
      console.log("✅ Browser 2: Article deleted and disappeared from list");

      // Wait for deletion to sync to Browser 1
      console.log("7️⃣  Browser 1: Waiting for deletion to sync from Browser 2...");
      await expect(articleTitle1).not.toBeVisible({ timeout: 30000 });
      console.log("✅ Browser 1: Article disappeared after deletion sync!");

      // Verify article is gone from Browser 1's IndexedDB
      console.log("8️⃣  Browser 1: Verifying article is deleted from IndexedDB...");
      const articleAfterDelete1 = await getArticleFromDB(page1, "death-by-a-thousand-cuts");
      expect(articleAfterDelete1).toBeFalsy();
      console.log("✅ Browser 1: Article confirmed deleted from IndexedDB");

      console.log("\n🎉 Multi-browser sync test completed successfully!");
      console.log("   ✓ Article synced from Browser 1 to Browser 2");
      console.log("   ✓ Deletion synced from Browser 2 to Browser 1");

    } finally {
      // Cleanup
      console.log("\n🧹 Cleaning up browser contexts...");
      await context1.close();
      await context2.close();
      console.log("✅ Cleanup completed");
    }
  });
});
