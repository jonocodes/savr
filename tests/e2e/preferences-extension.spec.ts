import { test, expect } from "@playwright/test";

/**
 * Preferences offers the browser extension next to the bookmarklets. The
 * install targets are build-configurable (VITE_FIREFOX_EXTENSION_URL /
 * VITE_CHROME_EXTENSION_URL); until store listings exist they default to the
 * extension README, which is what this test asserts.
 */
test.describe("Preferences: browser extension", () => {
  test("links to the extension install targets", async ({ page }) => {
    await page.goto("/prefs");
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("Browser extension")).toBeVisible();

    await expect(page.getByTestId("extension-firefox-link")).toHaveAttribute(
      "href",
      /browser-extension/
    );
    await expect(page.getByTestId("extension-chrome-link")).toHaveAttribute(
      "href",
      /browser-extension/
    );
  });
});
