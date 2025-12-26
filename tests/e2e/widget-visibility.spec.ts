import { test, expect } from "@playwright/test";
import { connectToRemoteStorage, waitForRemoteStorageSync } from "./utils/remotestorage-helper";
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

test.describe("RemoteStorage Widget Visibility", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to app
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Clear all browser storage to ensure clean state
    await page.evaluate(() => {
      // Clear IndexedDB
      indexedDB.deleteDatabase("savrDb");
      // Clear localStorage
      localStorage.clear();
      // Clear sessionStorage
      sessionStorage.clear();
    });

    // Reload after clearing storage
    await page.reload();
    await page.waitForLoadState("networkidle");

    // Connect to RemoteStorage programmatically
    const token = testEnv.RS_TOKEN;
    await connectToRemoteStorage(page, "testuser@localhost:8006", token);

    // Wait for initial sync
    await waitForRemoteStorageSync(page);
  });

  test("should show widget on home page", async ({ page }) => {
    console.log("1️⃣  Checking widget visibility on home page...");

    // Navigate to home page
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Wait a moment for widget to render
    await page.waitForTimeout(500);

    // Check if widget element exists and is visible
    const widget = page.locator("#remotestorage-widget");
    await expect(widget).toBeAttached({ timeout: 5000 });

    // Check if widget is actually visible (not display: none)
    const isVisible = await widget.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
    });

    expect(isVisible).toBe(true);
    console.log("✅ Widget is visible on home page");
  });

  test("should show widget on preferences page", async ({ page }) => {
    console.log("1️⃣  Checking widget visibility on preferences page...");

    // Navigate to preferences page
    await page.goto("/prefs");
    await page.waitForLoadState("networkidle");

    // Wait a moment for widget to render
    await page.waitForTimeout(500);

    // Check if widget element exists and is visible
    const widget = page.locator("#remotestorage-widget");
    await expect(widget).toBeAttached({ timeout: 5000 });

    // Check if widget is actually visible (not display: none)
    const isVisible = await widget.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
    });

    expect(isVisible).toBe(true);
    console.log("✅ Widget is visible on preferences page");
  });

  test("should hide widget on article page", async ({ page }) => {
    console.log("1️⃣  Creating an article first...");

    // First, ingest an article so we have one to view
    const addButton = page.locator('button:has-text("Add Article")');
    await expect(addButton).toBeVisible({ timeout: 10000 });
    await addButton.click();

    const dialog = page.locator('.MuiDialog-root, [role="dialog"]');
    await expect(dialog.first()).toBeVisible({ timeout: 5000 });

    const urlInput = page
      .locator('input[type="url"], input[placeholder*="url"], .MuiTextField-root input')
      .first();
    const testUrl = "http://localhost:8080/input/death-by-a-thousand-cuts/";
    await urlInput.fill(testUrl);

    const saveButton = dialog.locator('button:has-text("Save")').first();
    await saveButton.click();

    await expect(dialog.first()).not.toBeVisible({ timeout: 10000 });

    // Wait for article to appear in list
    const articleTitle = page.getByText(/Death/i);
    await expect(articleTitle).toBeVisible({ timeout: 60000 });
    console.log("✅ Article created");

    console.log("2️⃣  Navigating to article page...");

    // Navigate to the article page
    await page.goto("/article/death-by-a-thousand-cuts");
    await page.waitForLoadState("networkidle");

    // Wait a moment for any widget updates
    await page.waitForTimeout(200);

    console.log("3️⃣  Checking widget visibility on article page...");

    // Check if widget element exists
    const widget = page.locator("#remotestorage-widget");
    await expect(widget).toBeAttached({ timeout: 5000 });

    // Check if widget is hidden (display: none)
    const isHidden = await widget.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return style.display === "none" || style.visibility === "hidden" || style.opacity === "0";
    });

    expect(isHidden).toBe(true);
    console.log("✅ Widget is hidden on article page");
  });

  test("should show widget when navigating back from article to home", async ({ page }) => {
    console.log("1️⃣  Creating an article first...");

    // First, ingest an article so we have one to view
    const addButton = page.locator('button:has-text("Add Article")');
    await expect(addButton).toBeVisible({ timeout: 10000 });
    await addButton.click();

    const dialog = page.locator('.MuiDialog-root, [role="dialog"]');
    await expect(dialog.first()).toBeVisible({ timeout: 5000 });

    const urlInput = page
      .locator('input[type="url"], input[placeholder*="url"], .MuiTextField-root input')
      .first();
    const testUrl = "http://localhost:8080/input/death-by-a-thousand-cuts/";
    await urlInput.fill(testUrl);

    const saveButton = dialog.locator('button:has-text("Save")').first();
    await saveButton.click();

    await expect(dialog.first()).not.toBeVisible({ timeout: 10000 });

    // Wait for article to appear in list
    const articleTitle = page.getByText(/Death/i);
    await expect(articleTitle).toBeVisible({ timeout: 60000 });
    console.log("✅ Article created");

    console.log("2️⃣  Navigating to article page...");

    // Navigate to the article page
    await page.goto("/article/death-by-a-thousand-cuts");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    // Verify widget is hidden on article page
    const widget = page.locator("#remotestorage-widget");
    const isHiddenOnArticle = await widget.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return style.display === "none";
    });
    expect(isHiddenOnArticle).toBe(true);
    console.log("✅ Widget is hidden on article page");

    console.log("3️⃣  Navigating back to home page...");

    // Navigate back to home
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    console.log("4️⃣  Checking widget visibility on home page...");

    // Verify widget is visible again on home page
    const isVisibleOnHome = await widget.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
    });
    expect(isVisibleOnHome).toBe(true);
    console.log("✅ Widget is visible again on home page");
  });
});
