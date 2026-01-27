/**
 * Tests for ingestHtml storage behavior
 *
 * These tests verify that ingestHtml saves all required files to RemoteStorage,
 * including the critical article.json file needed for cross-device sync.
 *
 * This test was added after discovering that article.json was not being saved
 * during bookmarklet ingestion, causing "Dangling Remote Storage Directories"
 * in diagnostics.
 */

import { ingestHtml } from "../src/ingestion";
import { getFilePathMetadata, getFilePathRaw, getFilePathContent, getFileFetchLog } from "../src/lib";

// Mock DOMParser for Node.js environment
(global as any).DOMParser = class DOMParser {
  parseFromString(string: string, contentType: string): Document {
    const doc = {
      createElement: (tagName: string) => ({
        href: "",
        appendChild: () => {},
      }),
      head: {
        appendChild: () => {},
      },
      documentElement: {
        outerHTML: string,
      },
      querySelectorAll: () => [],
      body: {
        innerHTML: string,
      },
    } as any;
    return doc;
  }
};

// Import the flexible mock
const { __setMockReadability } = require("@mozilla/readability");

// Mock the storage-related imports
jest.mock("~/utils/storage", () => ({
  saveResource: jest.fn().mockResolvedValue("mocked-path"),
}));

jest.mock("~/utils/tools", () => ({
  fetchAndResizeImage: jest.fn().mockRejectedValue(new Error("Network disabled in test")),
  fetchWithTimeout: jest.fn().mockRejectedValue(new Error("Network disabled in test")),
  imageToDataUrl: jest.fn().mockResolvedValue("data:image/png;base64,test"),
}));

describe("ingestHtml - storage behavior", () => {
  let mockStorageClient: {
    storeFile: jest.Mock;
  };

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create a mock storage client
    mockStorageClient = {
      storeFile: jest.fn().mockResolvedValue(undefined),
    };

    // Set up default Readability mock
    __setMockReadability({
      title: "Test Article for Storage",
      content: "<p>This is test content for storage testing.</p>",
      length: 100,
      byline: "Test Author",
      publishedTime: "2023-01-15T10:00:00Z",
    });
  });

  describe("file saving to RemoteStorage", () => {
    it("should save article.json to RemoteStorage", async () => {
      const html = "<html><body><h1>Test</h1><p>Content</p></body></html>";
      const contentType = "text/html";
      const url = "https://example.com/article";
      const sendMessage = jest.fn();

      const result = await ingestHtml(mockStorageClient as any, html, contentType, url, sendMessage);

      // Find the call that saved article.json
      const articleJsonCall = mockStorageClient.storeFile.mock.calls.find(
        (call) => call[1].endsWith("/article.json")
      );

      expect(articleJsonCall).toBeDefined();
      expect(articleJsonCall[0]).toBe("application/json");
      expect(articleJsonCall[1]).toBe(getFilePathMetadata(result.article.slug));

      // Verify the saved article data is valid JSON with required fields
      const savedArticle = JSON.parse(articleJsonCall[2]);
      expect(savedArticle.slug).toBe(result.article.slug);
      expect(savedArticle.title).toBe(result.article.title);
      expect(savedArticle.url).toBe(url);
    });

    it("should save raw.html to RemoteStorage", async () => {
      const html = "<html><body><h1>Test</h1><p>Content</p></body></html>";
      const contentType = "text/html";
      const url = "https://example.com/article";
      const sendMessage = jest.fn();

      const result = await ingestHtml(mockStorageClient as any, html, contentType, url, sendMessage);

      // Find the call that saved raw.html
      const rawHtmlCall = mockStorageClient.storeFile.mock.calls.find(
        (call) => call[1].endsWith("/raw.html")
      );

      expect(rawHtmlCall).toBeDefined();
      expect(rawHtmlCall[0]).toBe("text/html");
      expect(rawHtmlCall[1]).toBe(getFilePathRaw(result.article.slug));
    });

    it("should save index.html (rendered content) to RemoteStorage", async () => {
      const html = "<html><body><h1>Test</h1><p>Content</p></body></html>";
      const contentType = "text/html";
      const url = "https://example.com/article";
      const sendMessage = jest.fn();

      const result = await ingestHtml(mockStorageClient as any, html, contentType, url, sendMessage);

      // Find the call that saved index.html
      const indexHtmlCall = mockStorageClient.storeFile.mock.calls.find(
        (call) => call[1].endsWith("/index.html")
      );

      expect(indexHtmlCall).toBeDefined();
      expect(indexHtmlCall[0]).toBe("text/html");
      expect(indexHtmlCall[1]).toBe(getFilePathContent(result.article.slug));
    });

    it("should save fetch.log to RemoteStorage", async () => {
      const html = "<html><body><h1>Test</h1><p>Content</p></body></html>";
      const contentType = "text/html";
      const url = "https://example.com/article";
      const sendMessage = jest.fn();

      const result = await ingestHtml(mockStorageClient as any, html, contentType, url, sendMessage);

      // Find the call that saved fetch.log
      const fetchLogCall = mockStorageClient.storeFile.mock.calls.find(
        (call) => call[1].endsWith("/fetch.log")
      );

      expect(fetchLogCall).toBeDefined();
      expect(fetchLogCall[0]).toBe("text/plain");
      expect(fetchLogCall[1]).toBe(getFileFetchLog(result.article.slug));
    });

    it("should save all required files for cross-device sync", async () => {
      const html = "<html><body><h1>Test</h1><p>Content</p></body></html>";
      const contentType = "text/html";
      const url = "https://example.com/article";
      const sendMessage = jest.fn();

      const result = await ingestHtml(mockStorageClient as any, html, contentType, url, sendMessage);

      const savedPaths = mockStorageClient.storeFile.mock.calls.map((call) => call[1]);
      const slug = result.article.slug;

      // These are the minimum files required for an article to sync properly
      expect(savedPaths).toContain(`saves/${slug}/article.json`);
      expect(savedPaths).toContain(`saves/${slug}/raw.html`);
      expect(savedPaths).toContain(`saves/${slug}/index.html`);
      expect(savedPaths).toContain(`saves/${slug}/fetch.log`);
    });

    it("should set ingestSource to bookmarklet for direct ingestHtml calls", async () => {
      const html = "<html><body><h1>Test</h1><p>Content</p></body></html>";
      const contentType = "text/html";
      const url = "https://example.com/article";
      const sendMessage = jest.fn();

      const result = await ingestHtml(mockStorageClient as any, html, contentType, url, sendMessage);

      expect(result.article.ingestSource).toBe("bookmarklet");

      // Also verify the saved article.json has the correct ingestSource
      const articleJsonCall = mockStorageClient.storeFile.mock.calls.find(
        (call) => call[1].endsWith("/article.json")
      );
      const savedArticle = JSON.parse(articleJsonCall[2]);
      expect(savedArticle.ingestSource).toBe("bookmarklet");
    });
  });

  describe("graceful handling when storage client is null", () => {
    it("should not throw when storage client is null", async () => {
      const html = "<html><body><h1>Test</h1><p>Content</p></body></html>";
      const contentType = "text/html";
      const url = "https://example.com/article";
      const sendMessage = jest.fn();

      // Should not throw
      const result = await ingestHtml(null, html, contentType, url, sendMessage);

      expect(result.article).toBeDefined();
      expect(result.article.slug).toBeDefined();
    });
  });
});
