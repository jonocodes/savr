/**
 * Tests for ingestRaw — the Readability-bypassing ingest path.
 *
 * Unlike ingestHtml, ingestRaw takes already-extracted content and metadata
 * (e.g. a YouTube transcript scraped by a bookmarklet) and stores it verbatim.
 * These tests verify that Readability is NOT consulted and that the same set of
 * files is written for cross-device sync.
 */

import { ingestRaw } from "../src/ingestion";
import { getFilePathMetadata, getFilePathRaw, getFilePathContent, getFileFetchLog } from "../src/lib";

// Mock DOMParser for Node.js environment (processHtmlAndImages parses the body)
(global as any).DOMParser = class DOMParser {
  parseFromString(string: string, contentType: string): Document {
    const doc = {
      createElement: (tagName: string) => ({ href: "", appendChild: () => {} }),
      head: { appendChild: () => {} },
      documentElement: { outerHTML: string },
      querySelectorAll: () => [],
      body: { innerHTML: string },
    } as any;
    return doc;
  }
};

// If Readability were ever consulted, it would return this distinctive title —
// so asserting it does NOT appear proves the bypass.
const { __setMockReadability } = require("@mozilla/readability");

jest.mock("~/utils/sync/storage", () => ({
  saveResource: jest.fn().mockResolvedValue("mocked-path"),
}));

jest.mock("~/utils/article/tools", () => ({
  fetchAndResizeImage: jest.fn().mockRejectedValue(new Error("Network disabled in test")),
  fetchWithTimeout: jest.fn().mockRejectedValue(new Error("Network disabled in test")),
  imageToDataUrl: jest.fn().mockResolvedValue("data:image/png;base64,test"),
}));

describe("ingestRaw - Readability bypass", () => {
  let mockStorageClient: { storeFile: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    mockStorageClient = { storeFile: jest.fn().mockResolvedValue(undefined) };
    __setMockReadability({
      title: "READABILITY-SHOULD-NOT-RUN",
      content: "<p>readability content that must not be used</p>",
      length: 100,
      byline: "Readability Author",
      publishedTime: "2023-01-15T10:00:00Z",
    });
  });

  const transcript =
    "My Video Title\n[00:00] hello and welcome\n[00:04] today we talk about savr";

  it("uses caller-supplied metadata verbatim and ignores Readability", async () => {
    const result = await ingestRaw(
      mockStorageClient as any,
      {
        content: transcript,
        contentType: "text/plain",
        title: "My Video Title",
        author: "Some Channel",
        url: "https://www.youtube.com/watch?v=abc123",
      },
      jest.fn()
    );

    expect(result.article.title).toBe("My Video Title");
    expect(result.article.title).not.toContain("READABILITY");
    expect(result.article.author).toBe("Some Channel");
    expect(result.article.url).toBe("https://www.youtube.com/watch?v=abc123");
    expect(result.article.slug).toBe("my-video-title");
    expect(result.article.ingestSource).toBe("raw");
    expect(result.article.wordCount).toBeGreaterThan(0);
  });

  it("trims metadata and defaults blanks to null", async () => {
    const result = await ingestRaw(
      mockStorageClient as any,
      { content: transcript, contentType: "text/plain", title: "  Padded  ", author: "  ", url: "" },
      jest.fn()
    );

    expect(result.article.title).toBe("Padded");
    expect(result.article.author).toBeNull();
    expect(result.article.url).toBeNull();
  });

  it("saves all files required for cross-device sync", async () => {
    const result = await ingestRaw(
      mockStorageClient as any,
      { content: transcript, contentType: "text/plain", title: "My Video Title" },
      jest.fn()
    );

    const savedPaths = mockStorageClient.storeFile.mock.calls.map((call) => call[1]);
    const slug = result.article.slug;

    expect(savedPaths).toContain(getFilePathMetadata(slug));
    expect(savedPaths).toContain(getFilePathRaw(slug));
    expect(savedPaths).toContain(getFilePathContent(slug));
    expect(savedPaths).toContain(getFileFetchLog(slug));

    const articleJsonCall = mockStorageClient.storeFile.mock.calls.find((call) =>
      call[1].endsWith("/article.json")
    );
    const savedArticle = JSON.parse(articleJsonCall![2]);
    expect(savedArticle.ingestSource).toBe("raw");
    expect(savedArticle.title).toBe("My Video Title");
  });

  it("does not throw when storage client is null", async () => {
    const result = await ingestRaw(
      null,
      { content: transcript, contentType: "text/plain", title: "My Video Title" },
      jest.fn()
    );

    expect(result.article).toBeDefined();
    expect(result.article.slug).toBe("my-video-title");
  });

  it("auto-detects content type when not specified", async () => {
    const result = await ingestRaw(
      mockStorageClient as any,
      { content: transcript, title: "My Video Title" },
      jest.fn()
    );

    expect(result.article.title).toBe("My Video Title");
    expect(result.article.mimeType).toBe("text/html");
  });
});
