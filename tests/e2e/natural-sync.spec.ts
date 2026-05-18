import { test, expect } from "@playwright/test";
import {
  connectToRemoteStorage,
  waitForRemoteStorageSync,
  setRSSyncInterval,
  getArticleFromDB,
  getWorkerStorageAddress,
  getWorkerToken,
  getContentServerUrl,
} from "./utils/remotestorage-helper";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

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

// How long to wait for a natural sync cycle (no manual trigger).
// RS default interval is 10s per direction; 2s during tests means ≤4s round-trip.
const NATURAL_SYNC_INTERVAL_MS = 2000;
const NATURAL_SYNC_TIMEOUT_MS = 30000;

test.describe("Natural sync (no manual trigger)", () => {
  test.setTimeout(120000);

  test("article added in browser 1 appears in browser 2 without manual sync trigger", async ({
    browser,
  }) => {
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();

    await context1.addCookies([
      { name: "savr-sync-enabled", value: "true", domain: "localhost", path: "/" },
    ]);
    await context2.addCookies([
      { name: "savr-sync-enabled", value: "true", domain: "localhost", path: "/" },
    ]);

    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    try {
      const token = getWorkerToken(testEnv.RS_TOKENS, test.info().workerIndex);
      const storageAddress = getWorkerStorageAddress(test.info().workerIndex);

      // ── Browser 1 setup ──
      await page1.goto("/");
      await page1.waitForLoadState("networkidle");
      await connectToRemoteStorage(page1, storageAddress, token);
      await waitForRemoteStorageSync(page1);
      await setRSSyncInterval(page1, NATURAL_SYNC_INTERVAL_MS);
      console.log("✅ Browser 1 connected, sync interval set to", NATURAL_SYNC_INTERVAL_MS, "ms");

      // ── Browser 2 setup ──
      await page2.goto("/");
      await page2.waitForLoadState("networkidle");
      await connectToRemoteStorage(page2, storageAddress, token);
      await waitForRemoteStorageSync(page2);
      await setRSSyncInterval(page2, NATURAL_SYNC_INTERVAL_MS);
      console.log("✅ Browser 2 connected, sync interval set to", NATURAL_SYNC_INTERVAL_MS, "ms");

      // ── Add article in browser 1, no sync trigger ──
      console.log("1️⃣  Browser 1: Adding article (no manual sync)...");
      const addButton = page1
        .locator('button:has-text("Add Article"), button[aria-label*="add" i], button:has(.MuiSvgIcon-root)')
        .first();
      await expect(addButton).toBeVisible({ timeout: 10000 });
      await addButton.click();

      const dialog = page1.locator('.MuiDialog-root, [role="dialog"]');
      await expect(dialog.first()).toBeVisible({ timeout: 5000 });
      await page1
        .locator('input[type="url"], input[placeholder*="url"], .MuiTextField-root input')
        .first()
        .fill(`${getContentServerUrl()}/input/death-by-a-thousand-cuts/`);
      await dialog.locator('button:has-text("Save")').first().click();
      await expect(dialog.first()).not.toBeVisible({ timeout: 10000 });

      await expect(page1.getByText(/Death/i)).toBeVisible({ timeout: 60000 });
      const article1 = await getArticleFromDB(page1, "death-by-a-thousand-cuts");
      expect(article1?.slug).toBe("death-by-a-thousand-cuts");
      console.log("✅ Browser 1: Article saved to Dexie and RS —", article1?.title);

      // ── Browser 2 waits for natural sync (no triggerRemoteStorageSync call) ──
      console.log("2️⃣  Browser 2: Waiting for article to arrive via natural sync...");
      // Combine wait + read into one call to avoid the race window between two evaluate calls.
      // waitForFunction returns the JSHandle of the returned value, but we can't serialize
      // a JSHandle directly. Instead, poll until we get data in a single evaluate loop.
      const articleData2 = await page2.evaluate(
        async ({ slug, timeoutMs }: { slug: string; timeoutMs: number }) => {
          const deadline = Date.now() + timeoutMs;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const db = (window as any).savrDb;
          if (!db) return null;
          while (Date.now() < deadline) {
            try {
              const art = await db.articles.get(slug);
              if (art !== undefined) {
                return { slug: art.slug, title: art.title };
              }
            } catch { /* keep polling */ }
            await new Promise((r) => setTimeout(r, 200));
          }
          return null;
        },
        { slug: "death-by-a-thousand-cuts", timeoutMs: NATURAL_SYNC_TIMEOUT_MS },
      );

      expect(articleData2?.slug).toBe("death-by-a-thousand-cuts");
      expect(articleData2?.title).toBe(article1?.title);
      console.log("✅ Browser 2: Article arrived via natural sync —", articleData2?.title);

      await expect(page2.getByText(/Death/i)).toBeVisible({ timeout: 10000 });
      console.log("\n🎉 Natural sync test passed — no manual trigger needed!");
    } finally {
      try { await context1.close(); } catch { /* ignore */ }
      try { await context2.close(); } catch { /* ignore */ }
    }
  });
});
