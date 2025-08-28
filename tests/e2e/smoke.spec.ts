import { test, expect } from "@playwright/test";

test.describe("Smoke Test", () => {
  test("should load the main page", async ({ page }) => {
    // Navigate to the main page
    await page.goto("/");

    // Wait for the page to load
    await page.waitForLoadState("domcontentloaded");

    // Check that the page loaded
    await expect(page).toHaveTitle(/Savr/);

    // Check that the page body is visible
    await expect(page.locator("body")).toBeVisible();

    // Take a screenshot for verification
    await page.screenshot({ path: "test-results/smoke-test-loaded.png" });
  });

  test("should have basic page structure", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    // Check for basic HTML structure
    await expect(page.locator("html")).toBeVisible();
    await expect(page.locator("head")).toBeVisible();
    await expect(page.locator("body")).toBeVisible();

    // Check that the page has some content
    const bodyText = await page.locator("body").textContent();
    expect(bodyText).toBeTruthy();
    expect(bodyText!.length).toBeGreaterThan(0);
  });
});
