import { test, expect } from "@playwright/test";
import {
  connectToRemoteStorage,
  waitForRemoteStorageSync,
  getArticleFromDB,
  getRemoteStorageAddress,
  clearAllArticles,
  clearLocalIndexedDB,
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
  page: any,
  article: { slug: string; title: string; url: string; state?: string }
): Promise<void> {
  await page.evaluate(async (article: any) => {
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
async function getLocalArticleCount(page: any): Promise<number> {
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
async function getLocalArticleSlugs(page: any): Promise<string[]> {
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

test.describe("Sync Clears Local Articles on Connect", () => {
  test.setTimeout(120000); // 2 minutes

  test("should clear local articles and replace with remote articles when connecting", async ({
    browser,
  }) => {
    // Create two contexts:
    // 1. First context sets up remote articles
    // 2. Second context has local-only articles and then connects
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();

    // Enable sync via cookie for both contexts
    await context1.addCookies([
      { name: "savr-sync-enabled", value: "true", domain: "localhost", path: "/" },
    ]);
    await context2.addCookies([
      { name: "savr-sync-enabled", value: "true", domain: "localhost", path: "/" },
    ]);

    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    try {
      // ========================================
      // STEP 1: Set up remote articles using Browser 1
      // ========================================
      console.log("\n📱 Browser 1: Setting up remote articles...");
      await page1.goto("/");
      await page1.waitForLoadState("networkidle");

      const token = testEnv.RS_TOKEN;
      await connectToRemoteStorage(page1, getRemoteStorageAddress(), token);
      await waitForRemoteStorageSync(page1);
      console.log("✅ Browser 1: Connected to RemoteStorage");

      // Clear any existing articles first
      await clearAllArticles(page1);
      console.log("✅ Browser 1: Cleared existing articles");

      // Add a remote article by adding to IndexedDB and letting it sync
      // We'll use the helper to add directly, then trigger sync
      await addArticleToLocalDB(page1, {
        slug: "remote-article-1",
        title: "Remote Article 1",
        url: "https://example.com/remote-1",
      });
      await addArticleToLocalDB(page1, {
        slug: "remote-article-2",
        title: "Remote Article 2",
        url: "https://example.com/remote-2",
      });

      // Trigger sync to push to server
      await page1.evaluate(async () => {
        const rs = (window as any).remoteStorage;
        const client = (window as any).remoteStorageClient;
        if (rs && client) {
          // Store articles to RemoteStorage
          const dbName = "savrDb";
          const request = indexedDB.open(dbName);

          await new Promise<void>((resolve) => {
            request.onsuccess = async () => {
              const db = request.result;
              const transaction = db.transaction(["articles"], "readonly");
              const store = transaction.objectStore("articles");
              const getAllRequest = store.getAll();

              getAllRequest.onsuccess = async () => {
                const articles = getAllRequest.result;
                for (const article of articles) {
                  await client.storeObject(
                    "article",
                    `saves/${article.slug}/article.json`,
                    article
                  );
                  console.log(`Stored article to RemoteStorage: ${article.slug}`);
                }
                db.close();

                // Trigger sync
                if (rs.sync) {
                  rs.sync.sync();
                }

                // Wait for sync to complete
                await new Promise<void>((r) => setTimeout(r, 2000));
                resolve();
              };
            };
          });
        }
      });

      console.log("✅ Browser 1: Remote articles created and synced");

      // Verify remote articles exist
      const remoteArticle1 = await getArticleFromDB(page1, "remote-article-1");
      const remoteArticle2 = await getArticleFromDB(page1, "remote-article-2");
      expect(remoteArticle1).toBeTruthy();
      expect(remoteArticle2).toBeTruthy();
      console.log("✅ Browser 1: Verified remote articles exist");

      // ========================================
      // STEP 2: Set up Browser 2 with local-only articles (NOT connected)
      // ========================================
      console.log("\n📱 Browser 2: Setting up local-only articles...");
      await page2.goto("/");
      await page2.waitForLoadState("networkidle");

      // Wait for app to initialize but DON'T connect to RemoteStorage yet
      await page2.waitForTimeout(1000);

      // Add local-only articles directly to IndexedDB
      await addArticleToLocalDB(page2, {
        slug: "local-article-1",
        title: "Local Article 1",
        url: "https://example.com/local-1",
      });
      await addArticleToLocalDB(page2, {
        slug: "local-article-2",
        title: "Local Article 2",
        url: "https://example.com/local-2",
      });
      await addArticleToLocalDB(page2, {
        slug: "local-article-3",
        title: "Local Article 3",
        url: "https://example.com/local-3",
      });

      // Verify local articles exist
      const localCountBefore = await getLocalArticleCount(page2);
      const localSlugsBefore = await getLocalArticleSlugs(page2);
      console.log(`✅ Browser 2: Created ${localCountBefore} local articles: ${localSlugsBefore.join(", ")}`);
      expect(localCountBefore).toBe(3);
      expect(localSlugsBefore).toContain("local-article-1");
      expect(localSlugsBefore).toContain("local-article-2");
      expect(localSlugsBefore).toContain("local-article-3");

      // ========================================
      // STEP 3: Connect Browser 2 to RemoteStorage
      // ========================================
      console.log("\n📱 Browser 2: Connecting to RemoteStorage (should clear local articles)...");

      await connectToRemoteStorage(page2, getRemoteStorageAddress(), token);
      await waitForRemoteStorageSync(page2);
      console.log("✅ Browser 2: Connected and synced");

      // Give extra time for all sync events to process
      await page2.waitForTimeout(2000);

      // ========================================
      // STEP 4: Verify local articles were replaced with remote articles
      // ========================================
      console.log("\n🔍 Browser 2: Verifying articles after sync...");

      const localCountAfter = await getLocalArticleCount(page2);
      const localSlugsAfter = await getLocalArticleSlugs(page2);
      console.log(`   Articles after sync: ${localCountAfter} - ${localSlugsAfter.join(", ")}`);

      // Local articles should be GONE
      const localArticle1After = await getArticleFromDB(page2, "local-article-1");
      const localArticle2After = await getArticleFromDB(page2, "local-article-2");
      const localArticle3After = await getArticleFromDB(page2, "local-article-3");

      expect(localArticle1After).toBeFalsy();
      expect(localArticle2After).toBeFalsy();
      expect(localArticle3After).toBeFalsy();
      console.log("✅ Browser 2: Local articles were cleared");

      // Remote articles should be present
      const remoteArticle1After = await getArticleFromDB(page2, "remote-article-1");
      const remoteArticle2After = await getArticleFromDB(page2, "remote-article-2");

      expect(remoteArticle1After).toBeTruthy();
      expect(remoteArticle2After).toBeTruthy();
      console.log("✅ Browser 2: Remote articles were synced");

      // Final count should match remote articles
      expect(localCountAfter).toBe(2);
      expect(localSlugsAfter).toContain("remote-article-1");
      expect(localSlugsAfter).toContain("remote-article-2");
      expect(localSlugsAfter).not.toContain("local-article-1");
      expect(localSlugsAfter).not.toContain("local-article-2");
      expect(localSlugsAfter).not.toContain("local-article-3");

      console.log("\n🎉 Test passed: Local articles were cleared and replaced with remote articles on connect!");
    } finally {
      // Cleanup
      console.log("\n🧹 Cleaning up...");
      try {
        // Clear remote articles using Browser 1
        await clearAllArticles(page1);
      } catch (e) {
        console.warn("Cleanup warning:", e);
      }
      try {
        await context1.close();
      } catch (e) {
        console.warn("Context 1 cleanup:", e);
      }
      try {
        await context2.close();
      } catch (e) {
        console.warn("Context 2 cleanup:", e);
      }
      console.log("✅ Cleanup completed");
    }
  });
});
