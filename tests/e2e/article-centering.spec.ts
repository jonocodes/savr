import { test, expect } from "@playwright/test";

test.describe("Article header centering", () => {
  const slug = "test-article-centering";

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Wait for IndexedDB to be available (requires VITE_DEBUG=true dev server)
    await page.waitForFunction(() => !!(window as any).savrDb, { timeout: 10000 }); // eslint-disable-line @typescript-eslint/no-explicit-any

    // Seed a minimal article so the route renders ArticleComponent
    await page.evaluate(async (slug) => {
      const db = (window as any).savrDb; // eslint-disable-line @typescript-eslint/no-explicit-any
      await db.articles.put({
        slug,
        title: "Centering Test Article",
        url: "https://example.com/centering-test",
        state: "unread",
        ingestDate: new Date().toISOString(),
        mimeType: "text/html",
        readTimeMinutes: 1,
        progress: 0,
        ingestPlatform: "web",
        ingestSource: "manual",
        publication: null,
        author: null,
        publishedDate: null,
      });
    }, slug);

    await page.goto(`/article/${slug}`);
    await page.waitForLoadState("networkidle");
  });

  test.afterEach(async ({ page }) => {
    await page.evaluate(async (slug) => {
      const db = (window as any).savrDb; // eslint-disable-line @typescript-eslint/no-explicit-any
      if (db) await db.articles.delete(slug);
    }, slug);
  });

  test("images inside article content are constrained to container width", async ({ page }) => {
    const container = page.locator('[data-testid="article-content"]');
    await expect(container).toBeVisible({ timeout: 10000 });

    const maxWidth = await page.evaluate(() => {
      const articleContent = document.querySelector('[data-testid="article-content"]');
      if (!articleContent) return null;

      const box = articleContent.querySelector("div");
      if (!box) return null;

      const img = document.createElement("img");
      img.src = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";
      box.appendChild(img);

      const computedStyle = window.getComputedStyle(img);
      const result = computedStyle.maxWidth;

      box.removeChild(img);
      return result;
    });

    expect(maxWidth).toBe("100%");
  });

  test("h1 inside article content box is centered", async ({ page }) => {
    // ArticleComponent always renders its Box container even with empty html.
    // We inject a test h1 into the Box and check the computed text-align.
    // This tests the sx rule `"& h1": { textAlign: "center" }` without
    // needing RemoteStorage content to load.
    const container = page.locator('[data-testid="article-content"]');
    await expect(container).toBeVisible({ timeout: 10000 });

    const textAlign = await page.evaluate(() => {
      const articleContent = document.querySelector('[data-testid="article-content"]');
      if (!articleContent) return null;

      // The Box is the first direct div child of the Container
      const box = articleContent.querySelector("div");
      if (!box) return null;

      const h1 = document.createElement("h1");
      h1.textContent = "Test Article Title";
      box.appendChild(h1);

      const computedStyle = window.getComputedStyle(h1);
      const result = computedStyle.textAlign;

      box.removeChild(h1);
      return result;
    });

    expect(textAlign).toBe("center");
  });
});
