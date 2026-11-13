/**
 * The page-source seam in ingestUrl: a URL typed into the app can be
 * downloaded by the browser extension (when one is detected) before the
 * proxy/direct fetch, and the winning downloader — with any fallback chain —
 * is named in both the app log and the article's fetch log.
 */

import { ingestUrl } from "../src/ingestion";
import type { PageSource } from "~/utils/net/pageSources";
import { fetchWithTimeout } from "~/utils/article/tools";

const PAGE_URL = "https://news.example/story";

const { JSDOM } = require("jsdom");
(global as unknown as { DOMParser: unknown }).DOMParser = new JSDOM().window.DOMParser;

jest.mock("~/utils/sync/storage", () => ({
  saveResource: jest.fn().mockResolvedValue("mocked-path"),
}));

jest.mock("~/utils/article/tools", () => {
  class FetchError extends Error {
    requestUrl = "";
  }
  return {
    fetchWithTimeout: jest.fn(),
    imageToDataUrl: jest.fn().mockResolvedValue("data:image/png;base64,test"),
    FetchError,
  };
});

const mockedFetch = fetchWithTimeout as jest.Mock;

function htmlResponse(body = "<html><body><p>Story</p></body></html>") {
  return new Response(body, { headers: { "content-type": "text/html" } });
}

function pageSource(label: string, result: Response | Error): PageSource & { calls: string[] } {
  const calls: string[] = [];
  return {
    label,
    calls,
    async fetchPage(url) {
      calls.push(url);
      if (result instanceof Error) throw result;
      return result;
    },
  };
}

async function ingestAndReadFetchLog(opts?: Parameters<typeof ingestUrl>[3]) {
  const storeFile = jest.fn().mockResolvedValue(undefined);
  const article = await ingestUrl({ storeFile } as never, PAGE_URL, jest.fn(), opts);
  const logCall = storeFile.mock.calls.find((call) => call[1].endsWith("/fetch.log"));
  return { article, log: String(logCall![2]) };
}

describe("ingestUrl page sources", () => {
  beforeEach(() => {
    (globalThis as { localStorage?: Storage }).localStorage = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    } as unknown as Storage;
  });

  afterEach(() => {
    mockedFetch.mockReset();
    delete (globalThis as { localStorage?: Storage }).localStorage;
  });

  it("downloads through a supplied source without touching the proxy/direct fetch", async () => {
    const extension = pageSource("extension 0.1.5", htmlResponse());

    const { article, log } = await ingestAndReadFetchLog({ pageSources: [extension] });

    expect(extension.calls).toEqual([PAGE_URL]);
    expect(mockedFetch).not.toHaveBeenCalled();
    expect(article.ingestSource).toBe("url");
    expect(log.split("\n")[0]).toBe(`article downloaded via extension 0.1.5: ${PAGE_URL}`);
  });

  it("falls back to the direct fetch and logs the chain", async () => {
    const extension = pageSource("extension 0.1.5", new Error("no host permission"));
    mockedFetch.mockResolvedValue(htmlResponse());

    const { log } = await ingestAndReadFetchLog({ pageSources: [extension] });

    expect(mockedFetch).toHaveBeenCalledWith(PAGE_URL);
    expect(log.split("\n")[0]).toBe(
      `article downloaded via direct: ${PAGE_URL} (extension 0.1.5 failed (no host permission) -> direct ok)`
    );
  });

  it("without supplied sources, downloads directly as before", async () => {
    mockedFetch.mockResolvedValue(htmlResponse());

    const { log } = await ingestAndReadFetchLog();

    expect(log.split("\n")[0]).toBe(`article downloaded via direct: ${PAGE_URL}`);
  });

  it("rethrows the proxy/direct error when every source fails", async () => {
    const directError = new Error("HTTP 404 Not Found");
    const extension = pageSource("extension 0.1.5", new Error("HTTP 404"));
    mockedFetch.mockRejectedValue(directError);

    await expect(
      ingestUrl({ storeFile: jest.fn() } as never, PAGE_URL, jest.fn(), {
        pageSources: [extension],
      })
    ).rejects.toBe(directError);
  });

  it("rejects an error status from a supplied source like any other failure", async () => {
    const extension = pageSource(
      "extension 0.1.5",
      new Response("gone", { status: 410, headers: { "content-type": "text/html" } })
    );
    mockedFetch.mockResolvedValue(htmlResponse());

    const { log } = await ingestAndReadFetchLog({ pageSources: [extension] });

    expect(log.split("\n")[0]).toBe(
      `article downloaded via direct: ${PAGE_URL} (extension 0.1.5 failed (HTTP 410) -> direct ok)`
    );
  });
});
