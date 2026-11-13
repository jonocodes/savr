/**
 * Saved articles must reserve space for their images.
 *
 * web.css styles article images as `max-width: 100%; height: auto`. Without
 * width/height attributes there is no aspect ratio to lay out from, so every
 * image is a zero-height box until it decodes and then pops to full size,
 * shoving the text below it. Ingestion already knows the resized dimensions,
 * so it writes them onto the <img>.
 *
 * Images arrive through the image-source seam (a supplied ImageSource, as the
 * browser extension does). resizeImage needs <img> decoding and a <canvas>,
 * which Node lacks, so both are faked below with just enough behaviour: the
 * fake image reports a natural size, and the fake canvas truncates assigned
 * dimensions to whole pixels the way a real one does.
 */

import { ingestHtml } from "../src/ingestion";
import type { ImageSource } from "~/utils/net/imageSources";

const IMAGE_URL = "https://example.com/photo.jpg";

// A real DOM, so attribute writes survive into documentElement.outerHTML.
const { JSDOM } = require("jsdom");
(global as unknown as { DOMParser: unknown }).DOMParser = new JSDOM().window.DOMParser;

const { __setMockReadability } = require("@mozilla/readability");

// The direct-fetch fallback must fail, so a failing ImageSource means a failed image.
jest.mock("~/utils/article/tools", () => ({
  fetchWithTimeout: jest.fn().mockRejectedValue(new Error("network disabled in test")),
  imageToDataUrl: jest.fn().mockResolvedValue("data:image/jpeg;base64,mock-data-url"),
  FetchError: class FetchError extends Error {},
}));

/** Natural size of the next image the fake <img> decodes. */
let naturalSize = { width: 80, height: 60 };

class FakeImage {
  width = 0;
  height = 0;
  onload: (() => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  set src(_url: string) {
    this.width = naturalSize.width;
    this.height = naturalSize.height;
    setTimeout(() => this.onload?.());
  }
}

class FakeCanvas {
  private w = 0;
  private h = 0;
  // A real canvas's width/height are unsigned longs: assignment truncates.
  get width() {
    return this.w;
  }
  set width(v: number) {
    this.w = Math.trunc(v);
  }
  get height() {
    return this.h;
  }
  set height(v: number) {
    this.h = Math.trunc(v);
  }
  getContext() {
    return { drawImage() {} };
  }
  toBlob(cb: (b: Blob) => void, type?: string) {
    cb(new Blob(["resized"], { type: type ?? "image/png" }));
  }
}

const g = globalThis as Record<string, unknown>;
const saved = { Image: g.Image, document: g.document };
const savedURL = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };

beforeAll(() => {
  g.Image = FakeImage;
  // An empty cookie jar, as a fresh browser has: other ingest code reads it.
  g.document = { cookie: "", createElement: () => new FakeCanvas() };
  URL.createObjectURL = () => "blob:fake";
  URL.revokeObjectURL = () => {};
});

afterAll(() => {
  g.Image = saved.Image;
  g.document = saved.document;
  URL.createObjectURL = savedURL.create;
  URL.revokeObjectURL = savedURL.revoke;
});

const servingSource: ImageSource = {
  label: "test source",
  fetchImage: async () => new Blob(["image bytes"], { type: "image/jpeg" }),
};

const failingSource: ImageSource = {
  label: "test source",
  fetchImage: async () => {
    throw new Error("offline");
  },
};

async function ingestAndReadContent(source: ImageSource): Promise<string> {
  const storeFile = jest.fn().mockResolvedValue(undefined);
  await ingestHtml(
    { storeFile } as never,
    "<html><body><p>source</p></body></html>",
    "text/html",
    "https://example.com/article",
    jest.fn(),
    undefined,
    { imageSources: [source] }
  );
  const call = storeFile.mock.calls.find((c) => c[1].endsWith("/index.html"));
  expect(call).toBeDefined();
  return String(call![2]);
}

function setArticleImage(imgAttrs = "") {
  __setMockReadability({
    title: "Article With An Image",
    content: `<p>Body text.</p><img src="${IMAGE_URL}"${imgAttrs} alt="A photo">`,
    length: 100,
    byline: "Test Author",
    publishedTime: "2023-01-15T10:00:00Z",
  });
}

describe("ingestHtml - image dimensions", () => {
  beforeEach(() => {
    // Kept under the 5000px² thumbnail threshold: thumbnail generation also
    // needs FileReader and WebP encoding, which this suite doesn't fake.
    naturalSize = { width: 80, height: 60 };
    setArticleImage();
  });

  it("writes the resized dimensions onto downloaded images", async () => {
    const content = await ingestAndReadContent(servingSource);

    expect(content).toMatch(/<img[^>]*\swidth="80"/);
    expect(content).toMatch(/<img[^>]*\sheight="60"/);
  });

  it("overwrites stale dimensions from the source page", async () => {
    // The source claimed a size that no longer matches what we store.
    setArticleImage(` width="4000" height="3000"`);

    const content = await ingestAndReadContent(servingSource);

    expect(content).toMatch(/<img[^>]*\swidth="80"/);
    expect(content).not.toMatch(/width="4000"/);
  });

  it("reports the canvas's whole-pixel size, not the scaled float", async () => {
    // 3000x13 scaled to 1024 wide is 1024x4.437; the canvas holds 1024x4.
    naturalSize = { width: 3000, height: 13 };

    const content = await ingestAndReadContent(servingSource);

    expect(content).toMatch(/<img[^>]*\swidth="1024"/);
    expect(content).toMatch(/<img[^>]*\sheight="4"/);
  });

  it("claims no dimensions for an image that failed to download", async () => {
    // A failed download is swapped for a local placeholder (the original URL
    // is kept in data-orig-src for a later retry). We never learned the real
    // image size, so we must not write width/height for it — asserting a
    // wrong aspect ratio would be worse than asserting none.
    const content = await ingestAndReadContent(failingSource);

    expect(content).toMatch(/<img[^>]*\ssrc="data:image\/svg\+xml,/);
    expect(content).toContain(`data-orig-src="${IMAGE_URL}"`);
    expect(content).not.toMatch(/<img[^>]*\swidth=/);
  });
});
