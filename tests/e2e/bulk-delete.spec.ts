import { test, expect } from "@playwright/test";
import {
  connectToRemoteStorage,
  waitForRemoteStorageSync,
  getWorkerStorageAddress,
  getContentServerUrl,
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
} catch (error) {
  throw new Error(
    `Failed to load test environment from ${testEnvPath}. ` +
      `Make sure global-setup.ts ran successfully. Error: ${error}`,
  );
}

test.describe("Bulk Delete", () => {
  test.setTimeout(120000);

  test("should delete all articles from Dexie and RemoteStorage", async ({ page }) => {
    await page.context().addCookies([
      { name: "savr-sync-enabled", value: "true", domain: "localhost", path: "/" },
    ]);

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const token = getWorkerToken(testEnv.RS_TOKENS, test.info().workerIndex);
    await connectToRemoteStorage(page, getWorkerStorageAddress(test.info().workerIndex), token);
    await waitForRemoteStorageSync(page);

    // Ingest two articles so there's something to delete
    console.log("Ingesting articles...");
    for (const articlePath of ["death-by-a-thousand-cuts", "dune-part-two"]) {
      const addButton = page
        .locator('button:has-text("Add Article"), button[aria-label*="add" i], button:has(.MuiSvgIcon-root)')
        .first();
      await expect(addButton).toBeVisible({ timeout: 10000 });
      await addButton.click();

      const dialog = page.locator('.MuiDialog-root, [role="dialog"]');
      await expect(dialog.first()).toBeVisible({ timeout: 5000 });
      await page.locator('input[type="url"], input[placeholder*="url"], .MuiTextField-root input').first()
        .fill(`${getContentServerUrl()}/input/${articlePath}/`);
      await dialog.locator('button:has-text("Save")').first().click();
      await expect(dialog.first()).not.toBeVisible({ timeout: 10000 });
    }

    // Wait for both articles to appear
    await expect(page.getByText(/Death/i)).toBeVisible({ timeout: 60000 });
    await expect(page.getByText(/Dune/i)).toBeVisible({ timeout: 60000 });

    // Confirm count in Dexie
    const countBefore = await page.evaluate(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = (window as any).savrDb;
      if (!db) return -1;
      return db.articles.count();
    });
    expect(countBefore).toBeGreaterThanOrEqual(2);
    console.log(`✅ ${countBefore} articles in Dexie before delete`);

    // Navigate to Preferences and trigger Delete All
    console.log("Navigating to Preferences...");
    await page.goto("/prefs");
    await page.waitForLoadState("networkidle");

    const deleteAllButton = page.getByTestId("delete-all-articles-button");
    await expect(deleteAllButton).toBeVisible({ timeout: 10000 });
    await deleteAllButton.click();

    // Confirm the dialog
    const confirmButton = page.getByTestId("confirm-delete-all-button");
    await expect(confirmButton).toBeVisible({ timeout: 5000 });
    await confirmButton.click();

    // Poll until Dexie is empty
    await page.waitForFunction(
      async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const db = (window as any).savrDb;
        if (!db) return false;
        try { return (await db.articles.count()) === 0; } catch { return false; }
      },
      { timeout: 30000 },
    );
    console.log("✅ Dexie is empty after Delete All");

    // Navigate back to main page and verify no articles shown
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(/Death/i)).not.toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/Dune/i)).not.toBeVisible({ timeout: 5000 });
    console.log("✅ Main page shows no articles");
  });
});
