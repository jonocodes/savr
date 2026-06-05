import { test, expect, Page } from "@playwright/test";
import {
  connectToRemoteStorage,
  waitForRemoteStorageSync,
  getArticleFromDB,
  getWorkerStorageAddress,
  clearAllArticles,
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = (window as any).savrDb;
    if (!db) throw new Error("savrDb not available");
    await db.articles.put({
      ...article,
      state: article.state || "unread",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    console.log(`Added local article: ${article.slug}`);
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = (window as any).savrDb;
    if (!db) return 0;
    return await db.articles.count();
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

      const token = getWorkerToken(testEnv.RS_TOKENS, test.info().workerIndex);
      await connectToRemoteStorage(page, getWorkerStorageAddress(test.info().workerIndex), token);
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

      // Verify the test article specifically was NOT re-fetched (would indicate it was
      // deleted then re-added rather than incrementally preserved).
      const wasRefetched = await page.evaluate((slug) => {
        const diag = (window as unknown as { __savrDiag?: Array<{ category: string; data: Record<string, unknown> }> }).__savrDiag ?? [];
        return diag.some(
          (e) => e.category === "db-put" && e.data.slug === slug && e.data.source === "reconcile"
        );
      }, TEST_ARTICLE_SLUG);
      expect(wasRefetched).toBe(false);

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
