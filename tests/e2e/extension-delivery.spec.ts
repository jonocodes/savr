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

  // Without a proxy (VITE_CORS_PROXY is empty in tests) the fallback is a direct
  // fetch; with one configured, the extension still supplies the bytes and the
  // proxy only sees the image the extension could not fetch.
  for (const proxy of [null, "http://proxy.invalid/?url="]) {
    test(`downloads images through the extension's relay and logs the downloader per file (${proxy ? "proxy configured" : "no proxy"})`, async ({
      page,
    }) => {
      // The fixture has one good image and one missing (404) image.
      const fallbackLabel = proxy ? "proxy proxy.invalid" : "direct";
      const articleUrl = `${getContentServerUrl()}/input/test-failed-image/`;
      const goodImageUrl = `${getContentServerUrl()}/input/sample-image/header-transparent.png`;
      const missingImageUrl = `${getContentServerUrl()}/input/test-failed-image/missing-image.png`;
      const imageSlug = "failed-image-placeholder";
      const testHtml = await (await page.request.get(articleUrl)).text();

      // Any image request the app makes itself (proxy or direct) is recorded and
      // refused: the good image must arrive through the extension alone.
      const appImageRequests: string[] = [];
      await page.route(/\.png(\?|$)/, (route) => {
        appImageRequests.push(route.request().url());
        return route.abort();
      });

      // Stand-in for the extension's background: downloads the bytes outside the
      // page (CORS-exempt, like the real background) and replies as it would.
      await page.exposeFunction("__fakeExtensionFetch", async (url: string) => {
        const response = await page.request.get(url);
        if (!response.ok()) return { ok: false, error: `HTTP ${response.status()}` };
        const type = response.headers()["content-type"];
        const body = (await response.body()).toString("base64");
        return { ok: true, dataUrl: `data:${type};base64,${body}` };
      });

      // Stand-in for the extension's isolated-world relay.
      await page.addInitScript(() => {
        window.addEventListener("message", async (event) => {
          if (event.source !== window || event.data?.action !== "savr-image-request") return;
          const { id, url } = event.data;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const result = await (window as any).__fakeExtensionFetch(url);
          window.postMessage(
            { action: "savr-image-response", id, ...result },
            window.location.origin,
          );
        });
      });

      if (proxy) {
        await page.evaluate((value) => localStorage.setItem("savr-cors-proxy", value), proxy);
      }

      await page.goto(`/?bookmarklet=${encodeURIComponent(articleUrl)}`);
      await page.waitForLoadState("networkidle");

      // The extension's reply to savr-ready is the handshake: it carries the version.
      await page.evaluate(
        ({ html, url }) => {
          window.postMessage(
            {
              action: "savr-html",
              html,
              url,
              source: "extension",
              extensionVersion: "1.0.0",
            },
            window.location.origin,
          );
        },
        { html: testHtml, url: articleUrl },
      );

      await expect
        .poll(async () => (await getArticleFromDB(page, imageSlug))?.slug ?? null, {
          timeout: 60000,
        })
        .toBe(imageSlug);

      // The good image never went through the app's own fetch (zero proxy
      // requests for it); only the missing one fell back (and failed) after the
      // extension reported a 404.
      expect(appImageRequests).toEqual([
        proxy ? `${proxy}${encodeURIComponent(missingImageUrl)}` : missingImageUrl,
      ]);

      const stored = await page.evaluate(async (slug) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const client = (window as any).remoteStorageClient;
        const read = async (path: string) => (await client.getFile(path, false))?.data ?? null;
        return {
          html: await read(`saves/${slug}/index.html`),
          fetchLog: await read(`saves/${slug}/fetch.log`),
        };
      }, imageSlug);

      // The good image landed in storage as a local resource.
      const localPath = /data-local-path="([^"]+)"/.exec(stored.html ?? "")?.[1];
      expect(localPath).toBeTruthy();
      const resource = await page.evaluate(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (path) =>
          (await (window as any).remoteStorageClient.getFile(path, false))?.data ?? null,
        `saves/${imageSlug}/resources/${localPath}`,
      );
      expect(resource).toMatch(/^data:image\/png;base64,/);

      // The fetch log names the downloader for every file, fallback chain included.
      expect(stored.fetchLog).toContain(`image downloaded via extension 1.0.0 ok: ${goodImageUrl}`);
      expect(stored.fetchLog).toContain(
        `image failed via extension 1.0.0 failed (HTTP 404) -> ${fallbackLabel} failed`,
      );

      // So does the Diagnostics log.
      const imageLogs = await page.evaluate(async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const entries = await (window as any).savrDb.logs
          .where("category")
          .equals("image")
          .toArray();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return entries.map((entry: any) => ({
          message: entry.message,
          downloader: entry.meta?.downloader,
        }));
      });
      expect(imageLogs).toContainEqual({
        message: `Downloaded image via extension 1.0.0: ${goodImageUrl}`,
        downloader: "extension 1.0.0 ok",
      });
      expect(imageLogs).toContainEqual(
        expect.objectContaining({
          message: `Failed to download image: ${missingImageUrl}`,
          downloader: expect.stringContaining(
            `extension 1.0.0 failed (HTTP 404) -> ${fallbackLabel} failed`,
          ),
        }),
      );

      await deleteArticleFromDB(page, imageSlug);
    });
  }

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
