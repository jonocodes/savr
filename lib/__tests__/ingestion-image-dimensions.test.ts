/**
 * Saved articles must reserve space for their images.
 *
 * web.css styles article images as `max-width: 100%; height: auto`. Without
 * width/height attributes there is no aspect ratio to lay out from, so every
 * image is a zero-height box until it decodes and then pops to full size,
 * shoving the text below it. Ingestion already knows the resized dimensions,
 * so it writes them onto the <img>.
 */

import { ingestHtml } from "../src/ingestion";

// A real DOM, so attribute writes survive into documentElement.outerHTML.
beforeAll(() => {
  (global as any).DOMParser = class DOMParser {
    parseFromString(html: string): Document {
      return new (require("jsdom").JSDOM)(html).window.document;
    }
  };
});

const { __setMockReadability } = require("@mozilla/readability");
const { fetchAndResizeImage } = require("~/utils/article/tools");

describe("ingestHtml - image dimensions", () => {
  let mockStorageClient: { storeFile: jest.Mock };

  const savedContent = () =>
    mockStorageClient.storeFile.mock.calls.find((call) => call[1].endsWith("/index.html"))?.[2] as
      | string
      | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    mockStorageClient = { storeFile: jest.fn().mockResolvedValue(undefined) };
    // Deliberately under the 5000px² thumbnail threshold: thumbnail
    // generation calls resizeImage, which needs a real <canvas>, and this
    // suite runs in the node test environment.
    fetchAndResizeImage.mockResolvedValue({
      blob: new Blob(["mock image data"], { type: "image/jpeg" }),
      width: 80,
      height: 60,
    });
    __setMockReadability({
      title: "Article With An Image",
      content: `<p>Body text.</p><img src="https://example.com/photo.jpg" alt="A photo">`,
      length: 100,
      byline: "Test Author",
      publishedTime: "2023-01-15T10:00:00Z",
    });
  });

  it("writes the resized dimensions onto downloaded images", async () => {
    await ingestHtml(
      mockStorageClient as any,
      "<html><body><p>source</p></body></html>",
      "text/html",
      "https://example.com/article",
      jest.fn()
    );

    const content = savedContent();
    expect(content).toBeDefined();
    expect(content).toMatch(/<img[^>]*\swidth="80"/);
    expect(content).toMatch(/<img[^>]*\sheight="60"/);
  });

  it("overwrites stale dimensions from the source page", async () => {
    __setMockReadability({
      title: "Article With A Mis-sized Image",
      // The source claimed a size that no longer matches what we store.
      content: `<p>Body.</p><img src="https://example.com/photo.jpg" width="4000" height="3000" alt="A photo">`,
      length: 100,
      byline: "Test Author",
      publishedTime: "2023-01-15T10:00:00Z",
    });

    await ingestHtml(
      mockStorageClient as any,
      "<html><body><p>source</p></body></html>",
      "text/html",
      "https://example.com/article",
      jest.fn()
    );

    const content = savedContent();
    expect(content).toMatch(/<img[^>]*\swidth="80"/);
    expect(content).not.toMatch(/width="4000"/);
  });

  it("leaves images alone when the download fails", async () => {
    // A failed download keeps the original remote src, and we have no
    // dimensions to claim — asserting a wrong aspect ratio would be worse
    // than asserting none.
    fetchAndResizeImage.mockRejectedValue(new Error("offline"));

    await ingestHtml(
      mockStorageClient as any,
      "<html><body><p>source</p></body></html>",
      "text/html",
      "https://example.com/article",
      jest.fn()
    );

    const content = savedContent();
    expect(content).toContain("https://example.com/photo.jpg");
    expect(content).not.toMatch(/<img[^>]*\swidth=/);
  });
});
