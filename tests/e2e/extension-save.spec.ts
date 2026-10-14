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
    expect(response).toEqual({ ok: true });

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
});
