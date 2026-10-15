import {
  test,
  expect,
  chromium,
  type BrowserContext,
  type Page,
  type Worker,
} from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getAppOrigin, getArticleFromDB, getContentServerUrl } from "./utils/remotestorage-helper";

/**
 * Loads the real extension from browser-extension/ and runs a save end to end.
 *
 * Playwright cannot install WebExtensions into Firefox, so the extension's MV3
 * code is exercised in Chromium instead — which doubles as the Chrome-parity
 * check. The Firefox-specific packaging (background event page) is covered by
 * `web-ext lint` and manual verification; the app-side delivery contract has
 * its own spec (extension-delivery.spec.ts).
 */

const APP_URL = getAppOrigin();
const EXTENSION_PATH = path.resolve(process.cwd(), "browser-extension");

test.describe("Browser extension save flow", () => {
  test.setTimeout(180000);

  let context: BrowserContext;
  let userDataDir: string;
  let background: Worker;

  test.beforeAll(async () => {
    userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "savr-extension-"));
    context = await chromium.launchPersistentContext(userDataDir, {
      channel: "chromium",
      headless: true,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });

    background = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
  });

  test.afterAll(async () => {
    await context?.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  });

  test("options page exposes the Savr address and the GitHub link", async () => {
    const extensionId = new URL(background.url()).host;

    const optionsPage = await context.newPage();
    await optionsPage.goto(`chrome-extension://${extensionId}/options.html`);
    const address = optionsPage.locator("#app-url");
    await expect(address).toBeVisible();
    await expect(address).toHaveValue(/^https?:\/\//);
    await expect(
      optionsPage.locator('a[href="https://github.com/jonocodes/savr"]')
    ).toBeVisible();

    // The YouTube transcript toggle is on by default and persists with Save.
    await expect(optionsPage.locator("#youtube-transcripts")).toBeChecked();
    await optionsPage.locator("#youtube-transcripts").uncheck();
    await optionsPage.getByRole("button", { name: "Save" }).click();
    await expect(optionsPage.locator("#status")).toHaveText("Saved.");
    await optionsPage.reload();
    await expect(optionsPage.locator("#youtube-transcripts")).not.toBeChecked();

    const popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);
    await expect(popupPage.locator("#settings")).toBeVisible();
  });

  test("saves the active tab's loaded DOM into Savr", async () => {
    const articleUrl = `${getContentServerUrl()}/input/test-article-for-local-ingestion/`;

    // The article is the active tab when the save is triggered, exactly as it
    // would be when the toolbar popup is open.
    const articlePage = await context.newPage();
    await articlePage.goto(articleUrl);
    await expect(articlePage).toHaveTitle(/Test Article for Local Ingestion/);

    // Trigger the same message the popup's button sends. Sent from the popup
    // page itself (not the service worker) so the background's onMessage
    // wiring is part of what the test exercises.
    const extensionId = new URL(background.url()).host;
    const popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);
    await popupPage.evaluate(async (appUrl) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (globalThis as any).chrome.storage.local.set({ savrAppUrl: appUrl });
    }, APP_URL);
    await articlePage.bringToFront();
    const response = await popupPage.evaluate(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return await (globalThis as any).chrome.runtime.sendMessage({ type: "SAVE_ACTIVE_PAGE" });
    });
    await popupPage.close();
    expect(response).toMatchObject({ ok: true });

    // The extension opens the app with the bookmarklet entry point and
    // delivers the scraped DOM once the app announces it is listening.
    let appPage: Page | undefined;
    await expect
      .poll(
        () => {
          appPage = context
            .pages()
            .find((page) => page.url().startsWith(`${APP_URL}/?bookmarklet=`));
          return Boolean(appPage);
        },
        { timeout: 30000 }
      )
      .toBe(true);

    // The article lands in the app's local database.
    const slug = "test-article-for-local-ingestion";
    await expect
      .poll(() => getArticleFromDB(appPage!, slug), { timeout: 60000 })
      .toMatchObject({ slug });

    const article = await getArticleFromDB(appPage!, slug);
    expect(article?.url).toBe(articleUrl);
    expect(article?.ingestSource).toBe("bookmarklet");
  });

  test("downloads the article's images through the extension and logs its version", async () => {
    const articleUrl = `${getContentServerUrl()}/input/test-failed-image/`;
    const goodImageUrl = `${getContentServerUrl()}/input/sample-image/header-transparent.png`;
    const missingImageUrl = `${getContentServerUrl()}/input/test-failed-image/missing-image.png`;
    const slug = "failed-image-placeholder";
    const extensionId = new URL(background.url()).host;

    const articlePage = await context.newPage();
    await articlePage.goto(articleUrl);

    const popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);
    const version = await popupPage.evaluate(async (appUrl) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chromeApi = (globalThis as any).chrome;
      await chromeApi.storage.local.set({ savrAppUrl: appUrl });
      return chromeApi.runtime.getManifest().version as string;
    }, APP_URL);
    await articlePage.bringToFront();
    const response = await popupPage.evaluate(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return await (globalThis as any).chrome.runtime.sendMessage({ type: "SAVE_ACTIVE_PAGE" });
    });
    await popupPage.close();
    expect(response).toMatchObject({ ok: true });

    let appPage: Page | undefined;
    await expect
      .poll(
        () => {
          appPage = context
            .pages()
            .find((page) => page.url().includes(encodeURIComponent(articleUrl)));
          return Boolean(appPage);
        },
        { timeout: 30000 }
      )
      .toBe(true);

    await expect
      .poll(() => getArticleFromDB(appPage!, slug), { timeout: 60000 })
      .toMatchObject({ slug });

    // The real background fetched the good image; the 404 fell back to the
    // app's own (direct, no proxy in tests) fetch and became a placeholder.
    const imageLogs = await appPage!.evaluate(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const entries = await (window as any).savrDb.logs.where("category").equals("image").toArray();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return entries.map((entry: any) => ({ message: entry.message, downloader: entry.meta?.downloader }));
    });
    expect(imageLogs).toContainEqual({
      message: `Downloaded image via extension ${version}: ${goodImageUrl}`,
      downloader: `extension ${version} ok`,
    });
    expect(imageLogs).toContainEqual(
      expect.objectContaining({
        message: `Failed to download image: ${missingImageUrl}`,
        downloader: expect.stringMatching(
          new RegExp(`^extension ${version.replace(/\./g, "\\.")} failed \\(HTTP 404\\) -> direct failed`)
        ),
      })
    );
  });
});

/**
 * The YouTube extractor is shared source (browser-extension/youtube-transcript.js):
 * the background serializes it into the watch tab, and the app's build inlines
 * the same function into the Preferences bookmarklet. These tests load the real
 * module in the extension's own context and run it against fixture DOMs — both
 * YouTube DOM generations, the panel-opening path, and the no-transcript case.
 */
test.describe("YouTube transcript extractor", () => {
  let context: BrowserContext;
  let background: Worker;

  test.beforeAll(async () => {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "savr-youtube-"));
    context = await chromium.launchPersistentContext(userDataDir, {
      channel: "chromium",
      headless: true,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });
    background = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
  });

  test.afterAll(async () => {
    await context?.close();
  });

  /** A fresh extension page to evaluate the extractor in (real module load). */
  async function withPopupPage<T>(fn: (page: Page) => Promise<T>): Promise<T> {
    const extensionId = new URL(background.url()).host;
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    try {
      return await fn(page);
    } finally {
      await page.close();
    }
  }

  test("scrapes the modern segment DOM, strips timestamps, and embeds the og:image thumbnail", async () => {
    const result = await withPopupPage((page) =>
      page.evaluate(async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const chromeApi = (globalThis as any).chrome;
        const mod = await import(chromeApi.runtime.getURL("youtube-transcript.js"));
        document.body.innerHTML = `
          <meta property="og:image" content="https://i.ytimg.com/vi/fixture/maxresdefault.jpg">
          <h1 class="ytd-watch-metadata">Fixture Video Title</h1>
          <ytd-channel-name><div id="text"><a>Fixture Channel</a></div></ytd-channel-name>
          <transcript-segment-view-model>
            <div class="ytwTranscriptSegmentViewModelTimestamp">0:05</div>
            <span class="ytAttributedStringHost">Hello world &amp; friends</span>
          </transcript-segment-view-model>
          <transcript-segment-view-model>
            <div class="ytwTranscriptSegmentViewModelTimestamp">0:12</div>
            <span class="ytAttributedStringHost">Second line</span>
          </transcript-segment-view-model>
        `;
        return await mod.scrapeYouTubeTranscript();
      })
    );

    expect(result.ok).toBe(true);
    expect(result.title).toBe("Fixture Video Title");
    expect(result.author).toBe("Fixture Channel");
    expect(result.contentType).toBe("text/html");
    expect(result.content).toContain("https://i.ytimg.com/vi/fixture/maxresdefault.jpg");
    expect(result.content).toContain("Hello world &amp; friends");
    expect(result.content).toContain("Second line");
    expect(result.content).not.toContain("0:05");
  });

  test("scrapes the legacy segment DOM and falls back to the hqdefault thumbnail", async () => {
    const result = await withPopupPage((page) =>
      page.evaluate(async () => {
        window.history.replaceState({}, "", "?v=abcdefghijk");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const chromeApi = (globalThis as any).chrome;
        const mod = await import(chromeApi.runtime.getURL("youtube-transcript.js"));
        document.body.innerHTML = `
          <h1 class="ytd-watch-metadata">Legacy Fixture</h1>
          <ytd-transcript-segment-renderer>
            <div class="segment-timestamp">1:00</div>
            <div class="segment-text">Legacy line</div>
          </ytd-transcript-segment-renderer>
        `;
        return await mod.scrapeYouTubeTranscript();
      })
    );

    expect(result.ok).toBe(true);
    expect(result.title).toBe("Legacy Fixture");
    expect(result.content).toContain("Legacy line");
    expect(result.content).toContain("https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg");
  });

  test("opens the transcript panel when segments are not present yet", async () => {
    const result = await withPopupPage((page) =>
      page.evaluate(async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const chromeApi = (globalThis as any).chrome;
        const mod = await import(chromeApi.runtime.getURL("youtube-transcript.js"));
        document.body.innerHTML = `
          <h1 class="ytd-watch-metadata">Panel Fixture</h1>
          <button aria-label="Show transcript" id="open-transcript">Show transcript</button>
          <div id="panel"></div>
        `;
        const openButton = document.getElementById("open-transcript");
        openButton?.addEventListener("click", () => {
          const panel = document.getElementById("panel");
          if (!panel || panel.querySelector("transcript-segment-view-model")) return;
          panel.innerHTML = `
            <transcript-segment-view-model>
              <span class="ytAttributedStringHost">Opened panel line</span>
            </transcript-segment-view-model>
          `;
        });
        return await mod.scrapeYouTubeTranscript();
      })
    );

    expect(result.ok).toBe(true);
    expect(result.content).toContain("Opened panel line");
  });

  test("reports failure when there is no transcript", async () => {
    const result = await withPopupPage((page) =>
      page.evaluate(async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const chromeApi = (globalThis as any).chrome;
        const mod = await import(chromeApi.runtime.getURL("youtube-transcript.js"));
        document.body.innerHTML = `<h1 class="ytd-watch-metadata">No Transcript</h1>`;
        return await mod.scrapeYouTubeTranscript();
      })
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toBeTruthy();
  });
});
