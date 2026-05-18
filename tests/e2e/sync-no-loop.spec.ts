/**
 * Regression test: reconcile loop
 *
 * After an initial sync settles, the reconcile should not re-trigger continuously.
 * The known bug: sync-done fires every ~1s during RS background ticks, and each one
 * was scheduling a new reconcile, causing a continuous loop visible as "progress 0/1"
 * cycling in the DiagnosticsScreen.
 *
 * Invariants checked:
 * 1. After sync settles (first isSyncing:false), at most a few reconcile cycles run
 *    in the next 20 seconds (RS background tick is ~10s, so ≤3 is normal).
 * 2. Any reconcile cycles after settling must have total = 0 (nothing to fetch or delete).
 *    total > 0 after settling means an article is stuck in a fetch-fail loop.
 */

import { test, expect, Page } from "@playwright/test";
import {
  connectToRemoteStorage,
  getWorkerStorageAddress,
  clearAllArticles,
  getWorkerToken,
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
} catch (e) {
  throw new Error(
    `Failed to load test environment from ${testEnvPath}. Ensure global-setup ran. Error: ${e}`
  );
}

interface DiagEvent {
  category: string;
  data: Record<string, unknown>;
  ts: number;
}

function makeSeedArticle(i: number) {
  return {
    slug: `sync-loop-test-${i}`,
    title: `Sync Loop Test Article ${i}`,
    url: `https://example.com/sync-loop-test-${i}`,
    state: "unread",
    ingestDate: new Date().toISOString(),
    ingestPlatform: "test",
    ingestSource: "test",
    mimeType: "text/html",
    publication: null,
    author: null,
    publishedDate: null,
    readTimeMinutes: null,
    progress: 0,
  };
}

async function seedArticles(page: Page, count: number): Promise<void> {
  for (let i = 1; i <= count; i++) {
    const article = makeSeedArticle(i);
    await page.evaluate(async (a) => {
      const client = (window as unknown as { remoteStorageClient: { storeFile: (t: string, p: string, d: string) => Promise<void> } }).remoteStorageClient;
      if (!client) throw new Error("remoteStorageClient not available");
      await client.storeFile("application/json", `saves/${a.slug}/article.json`, JSON.stringify(a));
    }, article);
  }
}

test.describe("Sync loop regression", () => {
  test.setTimeout(120_000);

  test("reconcile does not loop after sync settles", async ({ page }) => {
    await page.context().addCookies([
      { name: "savr-sync-enabled", value: "true", domain: "localhost", path: "/" },
    ]);

    await page.goto("/", { waitUntil: "domcontentloaded" });

    // Connect to test Armadietto server
    await connectToRemoteStorage(page, getWorkerStorageAddress(test.info().workerIndex), getWorkerToken(testEnv.RS_TOKENS, test.info().workerIndex));

    // Clean Armadietto state so we are not racing with articles left by prior tests.
    await clearAllArticles(page);
    await page.waitForTimeout(1000);

    // Seed 5 articles so there is real sync work to do
    await seedArticles(page, 5);

    // Wait for first sync to settle: progress event with isSyncing: false
    await page.waitForFunction(
      () => {
        const diag = (window as unknown as { __savrDiag?: DiagEvent[] }).__savrDiag ?? [];
        return diag.some((e) => e.category === "progress" && e.data.isSyncing === false);
      },
      { timeout: 60_000 }
    );

    // Snapshot how many events exist at the point sync settled
    const snapshotIndex = await page.evaluate(
      () => ((window as unknown as { __savrDiag?: DiagEvent[] }).__savrDiag ?? []).length
    );

    // Wait 20s — covers 1-2 RS background sync ticks (~10s each)
    await page.waitForTimeout(20_000);

    // Collect progress events that fired after sync settled
    const postSettleProgress = await page.evaluate((idx: number) => {
      const diag = (window as unknown as { __savrDiag?: DiagEvent[] }).__savrDiag ?? [];
      return diag.slice(idx).filter((e) => e.category === "progress");
    }, snapshotIndex);

    const reconcileStarts = postSettleProgress.filter(
      (e) => e.data.isSyncing === true && e.data.processed === 0
    );

    const nonZeroTotalCycles = reconcileStarts.filter(
      (e) => (e.data.total as number) > 0
    );

    // Invariant 1: not a runaway loop (RS ticks ~10s, so ≤3 is generous)
    expect(
      reconcileStarts.length,
      `Reconcile fired ${reconcileStarts.length} times in 20s after settling — expected ≤3`
    ).toBeLessThanOrEqual(3);

    // Invariant 2: no cycle fetched anything — all articles should already be in Dexie
    expect(
      nonZeroTotalCycles,
      "Post-settle reconcile cycles should have total=0 (nothing to fetch)"
    ).toHaveLength(0);
  });

  test.afterEach(async ({ page }) => {
    try {
      await clearAllArticles(page);
    } catch {
      // best-effort cleanup
    }
  });
});
