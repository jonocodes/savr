import { test, expect } from "@playwright/test";
import {
  connectToRemoteStorage,
  waitForRemoteStorageSync,
  getArticleFromDB,
  getArticleContentFromServer,
  clearAllArticles,
  getWorkerStorageAddress,
  getContentServerUrl,
  getWorkerToken,
} from "./utils/remotestorage-helper";
import { loadTestEnv } from "./utils/test-helpers";

const testEnv = loadTestEnv();

/**
 * Regression test for #75: an image that fails to download during ingest must
 * be replaced with a local placeholder, so the saved article never keeps a
 * remote URL that every read would re-request.
 */
test.describe("Failed image placeholder", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(120000);

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    try {
      await page.evaluate(async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const db = (window as any).savrDb;
        if (db) await db.delete();
        localStorage.clear();
        sessionStorage.clear();
      });
    } catch (error) {
      console.log("Warning: Failed to clear browser storage:", error);
    }

    await page.reload();
    await page.waitForLoadState("networkidle");

    const token = getWorkerToken(testEnv.RS_TOKENS, test.info().workerIndex);
    await connectToRemoteStorage(page, getWorkerStorageAddress(test.info().workerIndex), token);
    await waitForRemoteStorageSync(page);
    await clearAllArticles(page);
  });

  test("rewrites a failed image to a local placeholder in the saved article", async ({ page }) => {
    const addButton = page
      .locator('button:has-text("Add Article"), button[aria-label*="add" i], button:has(.MuiSvgIcon-root)')
      .first();
    await expect(addButton).toBeVisible({ timeout: 10000 });
    await addButton.click();

    const dialog = page.locator('.MuiDialog-root, [role="dialog"]');
    await expect(dialog.first()).toBeVisible({ timeout: 5000 });

    const urlInput = dialog
      .locator('input[type="url"], input[placeholder*="url"], .MuiTextField-root input')
      .first();
    await urlInput.fill(`${getContentServerUrl()}/input/test-failed-image/`);

    const saveButton = dialog.locator('button:has-text("Save")').first();
    await saveButton.click();
    await expect(dialog.first()).not.toBeVisible({ timeout: 10000 });

    await expect(page.getByText("Failed Image Placeholder")).toBeVisible({ timeout: 60000 });
    await waitForRemoteStorageSync(page);

    const article = await getArticleFromDB(page, "failed-image-placeholder");
    expect(article).toBeTruthy();

    const html = await getArticleContentFromServer(page, "failed-image-placeholder");
    expect(html).toBeTruthy();

    // The broken image became a local placeholder, with its original URL kept
    // in data-orig-src for a future retry.
    expect(html).toContain("data:image/svg+xml");
    expect(html).toContain("missing-image.png");

    // ...but it is no longer referenced as a remote src. (Match a bare `src=`
    // attribute only — `data-orig-src=` must not satisfy this.)
    expect(html).not.toMatch(/\ssrc=["'][^"']*missing-image\.png/);

    // The working image downloaded for offline use.
    expect(html).toMatch(/src="data:image\/(png|jpeg|webp)/);
  });
});
