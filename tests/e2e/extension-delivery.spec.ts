import { test, expect } from "@playwright/test";
import {
  getArticleFromDB,
  deleteArticleFromDB,
  getContentServerUrl,
} from "./utils/remotestorage-helper";

/**
 * The browser extension (browser-extension/) does not use `window.opener`: it
 * opens the app in a tab through the tabs API and injects a page-side bridge
 * into that tab. For the bridge to deliver a payload it must hear the app
 * announce `savr-ready` on the page's own window. This spec pins that contract
 * for both ingest paths: scraped page HTML (`savr-html`, `?bookmarklet=`) and
 * already-extracted content (`savr-raw`, `?rawIngest=1`, e.g. a YouTube
 * transcript) — with no opener, the app still announces readiness and ingests
 * the page-side payload exactly like the corresponding bookmarklet.
 */
test.describe("Browser extension delivery contract", () => {
  test.setTimeout(120000);

  const slug = "test-article-for-local-ingestion";
  const rawSlug = "raw-contract-fixture";

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
    await deleteArticleFromDB(page, rawSlug);
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

  test("announces savr-ready on its own window for raw ingest and accepts a page-side savr-raw payload with no opener", async ({
    page,
  }) => {
    // Capture messages the app addresses to its own window, as above.
    await page.addInitScript(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__savrReadyCount = 0;
      window.addEventListener("message", (event) => {
        if (event.source !== window) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (event.data?.action === "savr-ready") (window as any).__savrReadyCount += 1;
      });
    });

    await page.goto("/?rawIngest=1");
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

    // A page-side bridge (the extension's YouTube transcript path) replies with
    // already-extracted content; the app stores it verbatim via ingestRaw.
    await page.evaluate(() => {
      window.postMessage(
        {
          action: "savr-raw",
          content: "Raw delivery contract fixture text.",
          contentType: "text/plain",
          title: "Raw Contract Fixture",
          author: "Test Author",
          url: "https://example.com/watch?v=abc123",
        },
        window.location.origin
      );
    });

    await expect
      .poll(async () => (await getArticleFromDB(page, rawSlug))?.ingestSource ?? null, {
        timeout: 60000,
      })
      .toBe("raw");

    const article = await getArticleFromDB(page, rawSlug);
    expect(article?.slug).toBe(rawSlug);
    expect(article?.title).toBe("Raw Contract Fixture");
  });
});
