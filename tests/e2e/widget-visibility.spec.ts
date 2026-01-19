import { test, expect } from "@playwright/test";
import { getTestHost } from "./utils/remotestorage-helper";

test.describe("RemoteStorage Widget Visibility", () => {
  test.beforeEach(async ({ page }) => {
    // Enable sync via cookie before navigating
    await page.context().addCookies([
      {
        name: "savr-sync-enabled",
        value: "true",
        domain: getTestHost(),
        path: "/",
      },
    ]);
  });

  test("widget should be visible on article list page", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Wait for widget to initialize
    await page.waitForTimeout(500);

    // Check that the widget container is visible
    const widgetContainer = page.locator("#remotestorage-container");
    await expect(widgetContainer).toBeVisible();

    // Check that the widget itself is visible (not display: none)
    const widget = page.locator("#remotestorage-widget");
    if ((await widget.count()) > 0) {
      await expect(widget).toBeVisible();
    }
  });

  test("widget should be hidden on article reading page", async ({ page }) => {
    // First go to main page
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Add a test article to the database so we can navigate to it
    await page.evaluate(() => {
      return new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("savrDb");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          try {
            const transaction = db.transaction(["articles"], "readwrite");
            const store = transaction.objectStore("articles");
            store.put({
              slug: "test-article",
              title: "Test Article",
              url: "https://example.com/test",
              state: "unread",
              ingestDate: new Date().toISOString(),
              readTimeMinutes: 5,
            });
            transaction.oncomplete = () => {
              db.close();
              resolve();
            };
            transaction.onerror = () => {
              db.close();
              reject(transaction.error);
            };
          } catch (e) {
            db.close();
            reject(e);
          }
        };
      });
    });

    // Navigate to the article page
    await page.goto("/article/test-article");
    await page.waitForLoadState("networkidle");

    // Wait for widget visibility to update
    await page.waitForTimeout(500);

    // Check that the widget itself is hidden (the container is always present,
    // but the widget inside has display:none on article pages)
    const widget = page.locator("#remotestorage-widget");
    await expect(widget).toBeHidden();
  });

  test("widget should be hidden when sync is disabled", async ({ page }) => {
    // Set sync to disabled
    await page.context().clearCookies();
    await page.context().addCookies([
      {
        name: "savr-sync-enabled",
        value: "false",
        domain: getTestHost(),
        path: "/",
      },
    ]);

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Wait for widget to initialize
    await page.waitForTimeout(500);

    // Check that the widget itself is hidden (the container is always present,
    // but the widget inside has display:none when sync is disabled)
    const widget = page.locator("#remotestorage-widget");
    await expect(widget).toBeHidden();
  });

  test("widget should become visible when navigating from article page to list", async ({
    page,
  }) => {
    // First add a test article
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.evaluate(() => {
      return new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("savrDb");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          try {
            const transaction = db.transaction(["articles"], "readwrite");
            const store = transaction.objectStore("articles");
            store.put({
              slug: "test-article-nav",
              title: "Test Article Navigation",
              url: "https://example.com/test-nav",
              state: "unread",
              ingestDate: new Date().toISOString(),
              readTimeMinutes: 5,
            });
            transaction.oncomplete = () => {
              db.close();
              resolve();
            };
            transaction.onerror = () => {
              db.close();
              reject(transaction.error);
            };
          } catch (e) {
            db.close();
            reject(e);
          }
        };
      });
    });

    // Go to article page - widget should be hidden
    await page.goto("/article/test-article-nav");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    const widget = page.locator("#remotestorage-widget");
    await expect(widget).toBeHidden();

    // Navigate back to list - widget should become visible
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    await expect(widget).toBeVisible();
  });
});
