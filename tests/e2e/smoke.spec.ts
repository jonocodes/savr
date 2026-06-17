import { test, expect } from "@playwright/test";

test.describe("Smoke Test", () => {
  test("should load the main page", async ({ page }) => {
    // Navigate to the main page - use commit to get initial response
    // Note: We use 'commit' because the React app may crash headless browsers
    // in certain environments (related to IndexedDB/RemoteStorage initialization)
    const response = await page.goto("/", { waitUntil: "commit" });

    // Verify we got a successful response
    expect(response?.status()).toBe(200);

    // Check title from initial HTML
    const title = await page.title();
    expect(title).toMatch(/Savr/);

    // Verify we have the correct page content
    const content = await page.content();
    expect(content).toContain('<div id="root">');
    expect(content).toContain('Savr');
  });

  test("should have correct HTML structure", async ({ page }) => {
    const response = await page.goto("/", { waitUntil: "commit" });
    expect(response?.status()).toBe(200);

    const content = await page.content();
    expect(content).toContain('<!DOCTYPE html>');
    expect(content).toContain('<html');
    expect(content).toContain('<head>');
    expect(content).toContain('<body>');
    expect(content).toContain('<div id="root">');
    expect(content).toContain('/src/main.tsx');
  });

  test("should render the React app with an add-article button", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    // The FAB is the primary interactive element rendered by React — if this is
    // missing the app white-screened or failed to hydrate.
    const fab = page.locator('.MuiFab-root, button[aria-label*="add" i]');
    await expect(fab.first()).toBeVisible({ timeout: 10000 });
  });
});
