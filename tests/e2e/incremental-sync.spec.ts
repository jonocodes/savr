import { test, expect, Page } from "@playwright/test";
import {
  connectToRemoteStorage,
  waitForRemoteStorageSync,
  getArticleFromDB,
  getRemoteStorageAddress,
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
      `Make sure global-setup.ts ran successfully. Error: ${error}`,
  );
}

const TEST_ARTICLE_SLUG = "test-article-for-incremental-sync";

/**
 * Add an article directly to IndexedDB
 */
async function addArticleToLocalDB(
  page: Page,
  article: { slug: string; title: string; url: string; state?: string }
): Promise<void> {
  await page.evaluate(async (article: { slug: string; title: string; url: string; state?: string }) => {
    const dbName = "savrDb";
    const request = indexedDB.open(dbName);

    return new Promise<void>((resolve, reject) => {
      request.onsuccess = () => {
        const db = request.result;

        try {
          const transaction = db.transaction(["articles"], "readwrite");
          const store = transaction.objectStore("articles");
          const putRequest = store.put({
            ...article,
            state: article.state || "unread",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });

          putRequest.onsuccess = () => {
            db.close();
            console.log(`Added local article: ${article.slug}`);
            resolve();
          };

          putRequest.onerror = () => {
            db.close();
            reject(putRequest.error);
          };
        } catch (error) {
          db.close();
          reject(error);
        }
      };

      request.onerror = () => reject(request.error);
    });
  }, article);
}

/**
 * Store article to RemoteStorage
 */
async function storeArticleToRemoteStorage(
  page: Page,
  article: { slug: string; title: string; url: string; state?: string }
): Promise<void> {
  await page.evaluate(async (article: { slug: string; title: string; url: string; state?: string }) => {
    const client = (window as unknown as { remoteStorageClient: { storeFile: (type: string, path: string, data: string) => Promise<void> } }).remoteStorageClient;
    if (!client) {
      throw new Error("RemoteStorage client not available");
    }

    const articleData = {
      ...article,
      state: article.state || "unread",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await client.storeFile(
      "application/json",
      `saves/${article.slug}/article.json`,
      JSON.stringify(articleData)
    );
    console.log(`Stored article to RemoteStorage: ${article.slug}`);
  }, article);
}

/**
 * Get count of articles in local IndexedDB
 */
async function getLocalArticleCount(page: Page): Promise<number> {
  return await page.evaluate(async () => {
    const dbName = "savrDb";
    const request = indexedDB.open(dbName);

    return new Promise<number>((resolve, reject) => {
      request.onsuccess = () => {
        const db = request.result;

        try {
          const transaction = db.transaction(["articles"], "readonly");
          const store = transaction.objectStore("articles");
          const countRequest = store.count();

          countRequest.onsuccess = () => {
            db.close();
            resolve(countRequest.result);
          };

          countRequest.onerror = () => {
            db.close();
            reject(countRequest.error);
          };
        } catch (error) {
          db.close();
          reject(error);
        }
      };

      request.onerror = () => reject(request.error);
    });
  });
}

/**
 * Capture console logs from the page
 */
function captureConsoleLogs(page: Page): string[] {
  const logs: string[] = [];
  page.on("console", (msg) => {
    logs.push(msg.text());
  });
  return logs;
}

test.describe("Incremental Sync", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(120000); // 2 minutes

  test("should preserve local articles on page reload (incremental sync)", async ({
    page,
  }) => {
    // Enable sync via cookie
    await page.context().addCookies([
      { name: "savr-sync-enabled", value: "true", domain: "localhost", path: "/" },
    ]);

    const logs = captureConsoleLogs(page);

    try {
      // ========================================
      // STEP 1: Connect and add an article to both local and remote
      // ========================================
      console.log("\n📱 Step 1: Connect and add an article...");
      await page.goto("/");
      await page.waitForLoadState("networkidle");

      const token = testEnv.RS_TOKEN;
      await connectToRemoteStorage(page, getRemoteStorageAddress(), token);
      await waitForRemoteStorageSync(page);
      console.log("✅ Connected to RemoteStorage");

      // Clear any existing articles first
      await clearAllArticles(page);
      await page.waitForTimeout(1000);

      // Add article to both local DB and RemoteStorage
      const testArticle = {
        slug: TEST_ARTICLE_SLUG,
        title: "Test Article for Incremental Sync",
        url: "https://example.com/incremental-sync-test",
      };

      await addArticleToLocalDB(page, testArticle);
      await storeArticleToRemoteStorage(page, testArticle);
      await page.waitForTimeout(1000);

      // Verify article exists
      const articleCountBefore = await getLocalArticleCount(page);
      const articleBefore = await getArticleFromDB(page, TEST_ARTICLE_SLUG);
      console.log(`✅ Article count before reload: ${articleCountBefore}`);
      expect(articleBefore).toBeTruthy();
      expect(articleCountBefore).toBeGreaterThanOrEqual(1);

      // ========================================
      // STEP 2: Reload page and verify articles preserved
      // ========================================
      console.log("\n📱 Step 2: Reload page...");

      // Clear captured logs to see fresh logs after reload
      logs.length = 0;

      await page.reload();
      await page.waitForLoadState("networkidle");

      // Wait for RemoteStorage to be available again (reconnection happens automatically)
      await page.waitForFunction(
        () => (window as unknown as { remoteStorage: { remote?: { connected?: boolean } } }).remoteStorage?.remote?.connected === true,
        { timeout: 15000 }
      ).catch(() => {
        // If not connected after 15s, continue anyway - we can still check the logs
        console.log("   Note: RemoteStorage may not have reconnected yet");
      });

      // Give sync a chance to process
      await page.waitForTimeout(3000);

      // ========================================
      // STEP 3: Verify article still exists (not re-downloaded)
      // ========================================
      console.log("\n🔍 Step 3: Verify article preserved...");

      const articleCountAfter = await getLocalArticleCount(page);
      const articleAfter = await getArticleFromDB(page, TEST_ARTICLE_SLUG);

      console.log(`   Article count after reload: ${articleCountAfter}`);
      expect(articleAfter).toBeTruthy();
      expect(articleCountAfter).toBeGreaterThanOrEqual(1);

      // Check console logs for incremental sync message (not clearing)
      const incrementalSyncLog = logs.find((log) =>
        log.includes("using incremental sync")
      );
      const clearingLog = logs.find((log) =>
        log.includes("clearing before sync")
      );

      console.log(`   Found 'incremental sync' log: ${!!incrementalSyncLog}`);
      console.log(`   Found 'clearing' log: ${!!clearingLog}`);

      // Should see incremental sync message, NOT clearing message
      expect(incrementalSyncLog).toBeTruthy();
      expect(clearingLog).toBeFalsy();

      console.log("\n🎉 Test passed: Articles preserved on reload (incremental sync)!");
    } finally {
      // Cleanup
      console.log("\n🧹 Cleaning up...");
      try {
        await clearAllArticles(page);
      } catch (e) {
        console.warn("Cleanup warning:", e);
      }
      console.log("✅ Cleanup completed");
    }
  });
});
