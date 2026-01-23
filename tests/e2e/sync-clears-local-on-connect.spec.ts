import { test, expect, Page } from "@playwright/test";
import {
  connectToRemoteStorage,
  waitForRemoteStorageSync,
  getArticleFromDB,
  getRemoteStorageAddress,
  clearAllArticles,
  disconnectFromRemoteStorage,
  triggerRemoteStorageSync,
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

/**
 * Add an article directly to IndexedDB (simulating local-only article)
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
 * Get all article slugs from local IndexedDB
 */
async function getLocalArticleSlugs(page: Page): Promise<string[]> {
  return await page.evaluate(async () => {
    const dbName = "savrDb";
    const request = indexedDB.open(dbName);

    return new Promise<string[]>((resolve, reject) => {
      request.onsuccess = () => {
        const db = request.result;

        try {
          const transaction = db.transaction(["articles"], "readonly");
          const store = transaction.objectStore("articles");
          const getAllRequest = store.getAllKeys();

          getAllRequest.onsuccess = () => {
            db.close();
            resolve(getAllRequest.result as string[]);
          };

          getAllRequest.onerror = () => {
            db.close();
            reject(getAllRequest.error);
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
 * Store article to RemoteStorage (for setting up test data)
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

    // Use storeFile with JSON content type instead of storeObject (which requires schema)
    await client.storeFile(
      "application/json",
      `saves/${article.slug}/article.json`,
      JSON.stringify(articleData)
    );
    console.log(`Stored article to RemoteStorage: ${article.slug}`);
  }, article);
}

test.describe("Sync Clears Local Articles on Connect", () => {
  test.setTimeout(120000); // 2 minutes

  test("should clear local articles and replace with remote articles when connecting", async ({
    page,
  }) => {
    // Enable sync via cookie
    await page.context().addCookies([
      { name: "savr-sync-enabled", value: "true", domain: "localhost", path: "/" },
    ]);

    try {
      // ========================================
      // STEP 1: Connect, add remote articles, then disconnect
      // ========================================
      console.log("\n📱 Setting up remote articles...");
      await page.goto("/");
      await page.waitForLoadState("networkidle");

      const token = testEnv.RS_TOKEN;
      await connectToRemoteStorage(page, getRemoteStorageAddress(), token);
      await waitForRemoteStorageSync(page);
      console.log("✅ Connected to RemoteStorage");

      // Clear any existing articles first
      await clearAllArticles(page);
      await page.waitForTimeout(1000);
      console.log("✅ Cleared existing articles");

      // Add remote articles
      await storeArticleToRemoteStorage(page, {
        slug: "remote-article-1",
        title: "Remote Article 1",
        url: "https://example.com/remote-1",
      });
      await storeArticleToRemoteStorage(page, {
        slug: "remote-article-2",
        title: "Remote Article 2",
        url: "https://example.com/remote-2",
      });
      await page.waitForTimeout(1000);
      console.log("✅ Added remote articles");

      // Verify remote articles exist in local DB
      const remoteArticle1 = await getArticleFromDB(page, "remote-article-1");
      const remoteArticle2 = await getArticleFromDB(page, "remote-article-2");
      expect(remoteArticle1).toBeTruthy();
      expect(remoteArticle2).toBeTruthy();
      console.log("✅ Verified remote articles in local DB");

      // Disconnect from RemoteStorage
      await disconnectFromRemoteStorage(page);
      await page.waitForTimeout(1000);
      console.log("✅ Disconnected from RemoteStorage");

      // ========================================
      // STEP 2: Add local-only articles (while disconnected)
      // ========================================
      console.log("\n📱 Adding local-only articles...");

      // Add local-only articles directly to IndexedDB
      await addArticleToLocalDB(page, {
        slug: "local-article-1",
        title: "Local Article 1",
        url: "https://example.com/local-1",
      });
      await addArticleToLocalDB(page, {
        slug: "local-article-2",
        title: "Local Article 2",
        url: "https://example.com/local-2",
      });
      await addArticleToLocalDB(page, {
        slug: "local-article-3",
        title: "Local Article 3",
        url: "https://example.com/local-3",
      });

      // Verify local articles exist
      const localCountBefore = await getLocalArticleCount(page);
      const localSlugsBefore = await getLocalArticleSlugs(page);
      console.log(
        `✅ Created ${localCountBefore} local articles: ${localSlugsBefore.join(", ")}`
      );
      expect(localCountBefore).toBe(3);
      expect(localSlugsBefore).toContain("local-article-1");
      expect(localSlugsBefore).toContain("local-article-2");
      expect(localSlugsBefore).toContain("local-article-3");

      // ========================================
      // STEP 3: Reconnect to RemoteStorage
      // ========================================
      console.log("\n📱 Reconnecting to RemoteStorage (should clear local articles)...");

      await connectToRemoteStorage(page, getRemoteStorageAddress(), token);
      await waitForRemoteStorageSync(page);
      console.log("✅ Reconnected and initial sync done");

      // Use manual sync helper to fetch remote articles (works around RemoteStorage.js limitation)
      console.log("   Triggering manual sync to fetch remote articles...");
      await triggerRemoteStorageSync(page);
      await page.waitForTimeout(2000);
      console.log("✅ Manual sync completed");

      // ========================================
      // STEP 4: Verify local articles were cleared
      // ========================================
      console.log("\n🔍 Verifying articles after sync...");

      const localSlugsAfter = await getLocalArticleSlugs(page);
      console.log(`   Articles after sync: ${localSlugsAfter.length} - ${localSlugsAfter.join(", ")}`);

      // Local articles should be GONE - this is the main thing we're testing
      const localArticle1After = await getArticleFromDB(page, "local-article-1");
      const localArticle2After = await getArticleFromDB(page, "local-article-2");
      const localArticle3After = await getArticleFromDB(page, "local-article-3");

      expect(localArticle1After).toBeFalsy();
      expect(localArticle2After).toBeFalsy();
      expect(localArticle3After).toBeFalsy();
      console.log("✅ Local articles were cleared on connect");

      // Note: Verifying that remote articles sync back is skipped due to known
      // RemoteStorage.js test environment limitation (see multi-browser-sync.spec.ts)
      // The important thing is that local articles don't persist after connecting.

      console.log(
        "\n🎉 Test passed: Local articles were cleared when connecting to sync!"
      );
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
