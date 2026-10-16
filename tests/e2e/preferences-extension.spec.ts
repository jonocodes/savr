import { test, expect } from "@playwright/test";

/**
 * Preferences offers the browser extension next to the bookmarklets. The
 * install targets are build-configurable (VITE_FIREFOX_EXTENSION_URL /
 * VITE_CHROME_EXTENSION_URL). Firefox defaults to the latest GitHub release
 * (whose assets include the signed XPI); Chrome is hidden until a store
 * listing exists.
 */
test.describe("Preferences: browser extension", () => {
  test("links to the extension install targets", async ({ page }) => {
    await page.goto("/prefs");
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("Browser extension")).toBeVisible();

    await expect(page.getByTestId("extension-firefox-link")).toHaveAttribute(
      "href",
      "https://github.com/jonocodes/savr/releases/latest"
    );
    await expect(page.getByTestId("extension-chrome-link")).toHaveCount(0);
  });
});
