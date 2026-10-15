/**
 * A proxied fetch must never persist the proxy URL (or its token) into the
 * saved article (#84). The HTML, raw HTML, metadata, and fetch log all store
 * original URLs only, so reading a saved article (or publishing it through the
 * public export, which serialises these same article objects) never reveals
 * or re-contacts the user's proxy.
 *
 * The fetch tools are mocked here (as in the rest of this suite); the guard is
 * that no persistence path writes the configured proxy prefix or token into
 * anything the article keeps.
 */

import { ingestHtml } from "../src/ingestion";

const TOKEN = "11111111-2222-4333-8444-555555555555";
const PROXY = `https://proxy.example/${TOKEN}/?url=`;

(global as unknown as { DOMParser: unknown }).DOMParser = class DOMParser {
  parseFromString(string: string) {
    return {
      createElement: () => ({ href: "", appendChild: () => {} }),
      head: { appendChild: () => {} },
      documentElement: { outerHTML: string },
      querySelectorAll: () => [],
      body: { innerHTML: string },
    };
  }
};

const { __setMockReadability } = require("@mozilla/readability");

jest.mock("~/utils/sync/storage", () => ({
  saveResource: jest.fn().mockResolvedValue("mocked-path"),
}));

jest.mock("~/utils/article/tools", () => ({
  fetchWithTimeout: jest.fn().mockRejectedValue(new Error("network disabled in test")),
  imageToDataUrl: jest.fn().mockResolvedValue("data:image/png;base64,test"),
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

describe("ingestion never persists the proxied URL", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    installLocalStorage({ "savr-cors-proxy": PROXY });
    __setMockReadability({
      title: "Proxied Article",
      content: "<p>Content fetched through a proxy.</p>",
      length: 100,
      byline: "Test Author",
      publishedTime: "2023-01-15T10:00:00Z",
    });
  });

  afterEach(() => {
    delete (globalThis as { localStorage?: Storage }).localStorage;
  });

  it("keeps the proxy prefix and token out of every persisted file", async () => {
    const storeFile = jest.fn().mockResolvedValue(undefined);
    const html = "<html><body><h1>Proxied</h1><p>Content</p></body></html>";
    const url = "https://example.com/article";

    const result = await ingestHtml(
      { storeFile } as never,
      html,
      "text/html",
      url,
      jest.fn(),
    );

    expect(storeFile).toHaveBeenCalled();
    for (const [, path, data] of storeFile.mock.calls) {
      expect(String(data)).not.toContain(TOKEN);
      expect(String(data)).not.toContain("proxy.example");
      expect(path).not.toContain(TOKEN);
    }

    // The persisted metadata still points at the article's real URL.
    const articleCall = storeFile.mock.calls.find((call) => call[1].endsWith("/article.json"));
    expect(articleCall).toBeDefined();
    expect(JSON.parse(articleCall![2]).url).toBe(url);
    expect(JSON.stringify(result.article)).not.toContain(TOKEN);
  });
});
