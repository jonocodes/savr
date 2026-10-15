import { test, expect, type Page } from "@playwright/test";

const article = {
  slug: "share-test-article",
  title: "Share Test Article",
  url: "https://example.com/share-me",
  state: "unread",
  ingestDate: "2026-10-14T00:00:00.000Z",
};

async function seedArticle(page: Page) {
  await page.goto("/");
  await page.waitForFunction(() => Boolean((window as { savrDb?: unknown }).savrDb));
  await page.evaluate(async (a) => {
    await (
      window as unknown as { savrDb: { articles: { put: (x: unknown) => Promise<unknown> } } }
    ).savrDb.articles.put(a);
  }, article);
}

async function openShareMenu(page: Page) {
  await expect(page.getByText(article.title)).toBeVisible();
  await page.getByTestId("article-menu-button").first().click();
  await page.getByTestId("article-menu-share").click();
}

test.describe("Sharing an article out", () => {
  test("opens the system share sheet when the Web Share API is available", async ({ page }) => {
    await page.addInitScript(() => {
      (window as { __shared?: ShareData | null }).__shared = null;
      Object.defineProperty(navigator, "share", {
        configurable: true,
        value: async (data: ShareData) => {
          (window as { __shared?: ShareData | null }).__shared = data;
        },
      });
    });

    await seedArticle(page);
    await openShareMenu(page);

    await expect
      .poll(() => page.evaluate(() => (window as { __shared?: ShareData | null }).__shared))
      .toEqual({ title: article.title, url: article.url });
    await expect(page.getByText("URL copied to clipboard")).toHaveCount(0);
  });

  test("copies the URL when the Web Share API is unavailable", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "share", {
        configurable: true,
        value: undefined,
      });
    });

    await seedArticle(page);
    await openShareMenu(page);

    await expect(page.getByText("URL copied to clipboard")).toBeVisible();
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toBe(article.url);
  });
});
