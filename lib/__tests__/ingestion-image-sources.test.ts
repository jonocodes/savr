/**
 * The image-source seam in ingest (#89): supplied sources (the browser
 * extension) are tried before the proxy/direct fetch, and every image's
 * downloader chain lands in the article's fetch log — proxy by hostname only,
 * never with its token.
 *
 * Successful downloads end in a canvas resize, which Node cannot run; the
 * successful path is covered by downloadImage's unit tests and the
 * extension-delivery e2e spec. Here every source fails, so the full chain is
 * visible.
 */

import { ingestHtml } from "../src/ingestion";
import type { ImageSource } from "~/utils/net/imageSources";

const TOKEN = "11111111-2222-4333-8444-555555555555";
const IMAGE_URL = "https://cdn.example/a.png";

// Real DOM parsing (jsdom ships no types; required like the readability mock below).
const { JSDOM } = require("jsdom");
(global as unknown as { DOMParser: unknown }).DOMParser = new JSDOM().window.DOMParser;

const { __setMockReadability } = require("@mozilla/readability");

jest.mock("~/utils/sync/storage", () => ({
  saveResource: jest.fn().mockResolvedValue("mocked-path"),
}));

jest.mock("~/utils/article/tools", () => ({
  fetchWithTimeout: jest.fn().mockRejectedValue(new Error("network disabled in test")),
  imageToDataUrl: jest.fn().mockResolvedValue("data:image/png;base64,test"),
  FetchError: class FetchError extends Error {},
}));

function installLocalStorage(initial: Record<string, string>) {
  const store = new Map(Object.entries(initial));
  (globalThis as { localStorage?: Storage }).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  } as unknown as Storage;
}

function failingExtension(calls: string[]): ImageSource {
  return {
    label: "extension 1.0.0",
    async fetchImage(url) {
      calls.push(url);
      throw new Error("no host permission");
    },
  };
}

async function ingestAndReadFetchLog(options?: Parameters<typeof ingestHtml>[6]) {
  const storeFile = jest.fn().mockResolvedValue(undefined);
  await ingestHtml(
    { storeFile } as never,
    "<html><body></body></html>",
    "text/html",
    "https://example.com/article",
    jest.fn(),
    undefined,
    options
  );
  const logCall = storeFile.mock.calls.find((call) => call[1].endsWith("/fetch.log"));
  return String(logCall![2]);
}

describe("ingest image sources", () => {
  beforeEach(() => {
    __setMockReadability({
      title: "Image Source Article",
      content: `<p>Body</p><img src="${IMAGE_URL}">`,
      length: 100,
      byline: "Test Author",
      publishedTime: "2023-01-15T10:00:00Z",
    });
  });

  afterEach(() => {
    delete (globalThis as { localStorage?: Storage }).localStorage;
  });

  it("tries the supplied source first, then falls back to the direct fetch", async () => {
    installLocalStorage({});
    const calls: string[] = [];

    const log = await ingestAndReadFetchLog({ imageSources: [failingExtension(calls)] });

    expect(calls).toEqual([IMAGE_URL]);
    expect(log).toContain(
      `image failed via extension 1.0.0 failed (no host permission) -> direct failed (network disabled in test): ${IMAGE_URL}`
    );
  });

  it("names the proxy by hostname only, never its token", async () => {
    installLocalStorage({ "savr-cors-proxy": `https://proxy.example/${TOKEN}/?url=` });

    const log = await ingestAndReadFetchLog();

    expect(log).toContain(`image failed via proxy proxy.example failed`);
    expect(log).not.toContain(TOKEN);
  });

  it("records the page download given by the caller", async () => {
    installLocalStorage({});

    const log = await ingestAndReadFetchLog({
      fetchLogPrelude: ["article downloaded via direct: https://example.com/article"],
    });

    expect(log.split("\n")[0]).toBe("article downloaded via direct: https://example.com/article");
  });
});
