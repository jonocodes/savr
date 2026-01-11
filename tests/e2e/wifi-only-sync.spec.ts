import { test, expect, Page } from "@playwright/test";

/**
 * Helper to inject PWA mode and network API mocks into the page
 */
async function setupPWAMode(page: Page, connectionType: "wifi" | "cellular") {
  await page.addInitScript((type: "wifi" | "cellular") => {
    // Mock PWA mode detection
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = function (query: string) {
      if (query === "(display-mode: standalone)") {
        return {
          matches: true, // Simulate PWA mode
          media: query,
          onchange: null,
          addListener: () => {},
          removeListener: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => true,
        } as MediaQueryList;
      }
      return originalMatchMedia.call(window, query);
    };

    // Mock Network Information API
    const connectionMock = {
      effectiveType: type,
      type: type,
      downlink: type === "wifi" ? 10 : 1,
      rtt: type === "wifi" ? 50 : 200,
      saveData: false,
      onchange: null as any,
      addEventListener: function (event: string, handler: any) {
        if (event === "change") {
          this.onchange = handler;
        }
      },
      removeEventListener: function () {
        this.onchange = null;
      },
      // Helper method to trigger connection change (for testing)
      _triggerChange: function () {
        if (this.onchange) {
          this.onchange();
        }
      },
    };

    Object.defineProperty(navigator, "connection", {
      configurable: true,
      get: () => connectionMock,
    });

    // Also expose a helper to change network type during tests
    (window as any).__setNetworkType = (newType: "wifi" | "cellular") => {
      connectionMock.effectiveType = newType;
      connectionMock.type = newType;
      connectionMock.downlink = newType === "wifi" ? 10 : 1;
      connectionMock.rtt = newType === "wifi" ? 50 : 200;
      connectionMock._triggerChange();
    };
  }, connectionType);
}

/**
 * Helper to enable sync in preferences
 */
async function enableSync(page: Page) {
  // Navigate to preferences
  await page.click('[aria-label="Settings"]');
  await page.waitForURL("/prefs");

  // Find and enable sync toggle
  const syncToggle = page.locator('text=Enable synchronization').locator("..").locator('input[type="checkbox"]');
  const isChecked = await syncToggle.isChecked();

  if (!isChecked) {
    await syncToggle.click();
    // Wait for page reload after enabling sync
    await page.waitForLoadState("networkidle");
    // Navigate back to preferences
    await page.goto("/prefs");
    await page.waitForLoadState("networkidle");
  }

  // Navigate back to home
  await page.click('[aria-label="Back"]');
  await page.waitForURL("/");
}

/**
 * Helper to toggle WiFi-only sync preference
 */
async function toggleWiFiOnlySync(page: Page, enable: boolean) {
  // Navigate to preferences
  await page.click('[aria-label="Settings"]');
  await page.waitForURL("/prefs");

  // Find WiFi-only toggle
  const wifiToggle = page.locator('text=Sync only over WiFi').locator("..").locator('input[type="checkbox"]');
  const isChecked = await wifiToggle.isChecked();

  if (enable && !isChecked) {
    await wifiToggle.click();
  } else if (!enable && isChecked) {
    await wifiToggle.click();
  }

  // Navigate back to home
  await page.click('[aria-label="Back"]');
  await page.waitForURL("/");
}

test.describe("WiFi-Only Sync Feature", () => {
  test("should show WiFi-only toggle only in PWA mode with sync enabled", async ({ page }) => {
    // Setup: Simulate PWA mode with WiFi
    await setupPWAMode(page, "wifi");
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Enable sync first
    await enableSync(page);

    // Navigate to preferences
    await page.click('[aria-label="Settings"]');
    await page.waitForURL("/prefs");

    // Verify WiFi-only toggle is visible in PWA mode
    const wifiToggle = page.locator('text=Sync only over WiFi');
    await expect(wifiToggle).toBeVisible();

    // Verify tooltip is present
    const tooltip = page.locator('text=Sync only over WiFi').locator("..").locator('[aria-label*="WiFi"]');
    await expect(tooltip).toBeVisible();
  });

  test("should show green sync indicator when WiFi-only is off", async ({ page }) => {
    // Setup: Simulate PWA mode with WiFi
    await setupPWAMode(page, "wifi");
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Enable sync
    await enableSync(page);

    // Ensure WiFi-only is disabled
    await toggleWiFiOnlySync(page, false);

    // Check for green sync indicator (active sync)
    const syncIndicator = page.locator('[style*="position: fixed"][style*="bottom: 16px"][style*="left: 16px"]');
    await expect(syncIndicator).toBeVisible();

    // The indicator should have success color (green border)
    const borderColor = await syncIndicator.evaluate((el) =>
      window.getComputedStyle(el).borderColor
    );
    // Green color check - should be rgb format
    expect(borderColor).toContain("46, 125, 50"); // MUI success.main color
  });

  test("should show orange indicator when WiFi-only is on and on cellular", async ({ page }) => {
    // Setup: Simulate PWA mode with cellular connection
    await setupPWAMode(page, "cellular");
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Enable sync
    await enableSync(page);

    // Enable WiFi-only mode
    await toggleWiFiOnlySync(page, true);

    // Check for orange sync indicator (paused sync)
    const syncIndicator = page.locator('[style*="position: fixed"][style*="bottom: 16px"][style*="left: 16px"]');
    await expect(syncIndicator).toBeVisible();

    // The indicator should have warning color (orange border)
    const borderColor = await syncIndicator.evaluate((el) =>
      window.getComputedStyle(el).borderColor
    );
    // Orange/warning color check
    expect(borderColor).toContain("237, 108, 2"); // MUI warning.main color
  });

  test("should switch indicator color when network changes", async ({ page }) => {
    // Setup: Start with WiFi
    await setupPWAMode(page, "wifi");
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Enable sync and WiFi-only mode
    await enableSync(page);
    await toggleWiFiOnlySync(page, true);

    // Initially should show green indicator (on WiFi)
    const syncIndicator = page.locator('[style*="position: fixed"][style*="bottom: 16px"][style*="left: 16px"]');
    await expect(syncIndicator).toBeVisible();

    let borderColor = await syncIndicator.evaluate((el) =>
      window.getComputedStyle(el).borderColor
    );
    expect(borderColor).toContain("46, 125, 50"); // Green

    // Simulate network change to cellular
    await page.evaluate(() => {
      (window as any).__setNetworkType("cellular");
    });

    // Wait a bit for the effect to process network change
    await page.waitForTimeout(2500); // Slightly more than the 2s interval

    // Should now show orange indicator (paused)
    borderColor = await syncIndicator.evaluate((el) =>
      window.getComputedStyle(el).borderColor
    );
    expect(borderColor).toContain("237, 108, 2"); // Orange

    // Switch back to WiFi
    await page.evaluate(() => {
      (window as any).__setNetworkType("wifi");
    });

    // Wait for the change to be detected
    await page.waitForTimeout(2500);

    // Should be green again
    borderColor = await syncIndicator.evaluate((el) =>
      window.getComputedStyle(el).borderColor
    );
    expect(borderColor).toContain("46, 125, 50"); // Green
  });

  test("should persist WiFi-only preference in cookie", async ({ page }) => {
    // Setup: Simulate PWA mode
    await setupPWAMode(page, "wifi");
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Enable sync
    await enableSync(page);

    // Enable WiFi-only mode
    await toggleWiFiOnlySync(page, true);

    // Check that cookie is set
    const cookies = await page.context().cookies();
    const wifiOnlyCookie = cookies.find((c) => c.name === "savr-wifi-only-sync");
    expect(wifiOnlyCookie).toBeDefined();
    expect(wifiOnlyCookie?.value).toBe("true");

    // Reload page
    await page.reload();
    await page.waitForLoadState("networkidle");

    // Navigate to preferences and verify toggle is still enabled
    await page.click('[aria-label="Settings"]');
    await page.waitForURL("/prefs");

    const wifiToggle = page.locator('text=Sync only over WiFi').locator("..").locator('input[type="checkbox"]');
    await expect(wifiToggle).toBeChecked();
  });

  test("should not show indicator when sync is disabled", async ({ page }) => {
    // Setup: Simulate PWA mode
    await setupPWAMode(page, "wifi");
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Make sure sync is disabled
    await page.click('[aria-label="Settings"]');
    await page.waitForURL("/prefs");

    const syncToggle = page.locator('text=Enable synchronization').locator("..").locator('input[type="checkbox"]');
    const isChecked = await syncToggle.isChecked();

    if (isChecked) {
      await syncToggle.click();
    }

    await page.click('[aria-label="Back"]');
    await page.waitForURL("/");

    // Verify indicator is not visible
    const syncIndicator = page.locator('[style*="position: fixed"][style*="bottom: 16px"][style*="left: 16px"]');
    await expect(syncIndicator).not.toBeVisible();
  });
});
