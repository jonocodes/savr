import { test, expect } from "@playwright/test";
import {
  getArticleFromDB,
  deleteArticleFromDB,
  getContentServerUrl,
} from "./utils/remotestorage-helper";

/**
 * The Firefox extension (browser-extension/) does not use `window.opener`: it
 * opens the app in a tab through the tabs API and injects a page-side bridge
 * into that tab. For the bridge to deliver the page HTML it must hear the app
 * announce `savr-ready` on the page's own window. This spec pins that contract:
 * with no opener, the app still announces readiness and ingests a page-side
 * `savr-html` payload exactly like a bookmarklet payload.
 */
test.describe("Browser extension delivery contract", () => {
  test.setTimeout(120000);

  const slug = "test-article-for-local-ingestion";

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.evaluate(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = (window as any).savrDb;
      if (db) await db.delete();
      localStorage.clear();
      sessionStorage.clear();
    });
  });

  test.afterEach(async ({ page }) => {
    await deleteArticleFromDB(page, slug);
  });

  test("announces savr-ready on its own window and accepts a page-side savr-html payload with no opener", async ({
    page,
  }) => {
    const articleUrl = `${getContentServerUrl()}/input/${slug}/`;
    const testHtml = await (await page.request.get(articleUrl)).text();

    // Capture messages the app addresses to its own window (the way an
    // extension-injected bridge would hear them). No opener is involved.
    await page.addInitScript(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__savrReadyCount = 0;
      window.addEventListener("message", (event) => {
        if (event.source !== window) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (event.data?.action === "savr-ready") (window as any).__savrReadyCount += 1;
      });
    });

    await page.goto(`/?bookmarklet=${encodeURIComponent(articleUrl)}`);
    await page.waitForLoadState("networkidle");

    const dialog = page.locator('.MuiDialog-root, [role="dialog"]');
    await expect(dialog.first()).toBeVisible({ timeout: 10000 });

    await expect
      .poll(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        () => page.evaluate(() => (window as any).__savrReadyCount),
        { timeout: 15000 }
      )
      .toBeGreaterThan(0);

    // A page-side bridge replies to the ready announcement with the scraped
    // page; the app must ingest it exactly like a bookmarklet payload.
    await page.evaluate(
      ({ html, url }) => {
        window.postMessage(
          { action: "savr-html", html, url, source: "extension" },
          window.location.origin
        );
      },
      { html: testHtml, url: articleUrl }
    );

    await expect
      .poll(async () => (await getArticleFromDB(page, slug))?.slug ?? null, { timeout: 60000 })
      .toBe(slug);

    const article = await getArticleFromDB(page, slug);
    expect(article?.ingestSource).toBe("bookmarklet");
    expect(article?.url).toBe(articleUrl);
  });
});
