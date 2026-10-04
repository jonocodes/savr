/**
 * Tests for the failed-image placeholder used during ingestion (#75).
 *
 * A failed download must not leave a remote URL in the saved HTML, otherwise
 * every read re-requests the dead image from a third-party host.
 */
import { applyImagePlaceholder, imagePlaceholderDataUrl } from "../src/ingestion";

function decode(dataUrl: string): string {
  return decodeURIComponent(dataUrl.slice(dataUrl.indexOf(",") + 1));
}

describe("imagePlaceholderDataUrl", () => {
  it("returns an inline SVG sized to the original image", () => {
    const url = imagePlaceholderDataUrl(100, 50);
    expect(url.startsWith("data:image/svg+xml,")).toBe(true);
    const svg = decode(url);
    expect(svg).toContain('width="100"');
    expect(svg).toContain('height="50"');
  });

  it("falls back to a default box when dimensions are unknown", () => {
    const svg = decode(imagePlaceholderDataUrl());
    expect(svg).toContain('width="640"');
    expect(svg).toContain('height="360"');
  });
});

describe("applyImagePlaceholder", () => {
  it("rewrites src to the placeholder and keeps the original URL", () => {
    const img = {
      src: "https://remote.example/x.jpg",
      dataset: {} as DOMStringMap,
    } as unknown as HTMLImageElement;

    applyImagePlaceholder(img, "https://remote.example/x.jpg", 200, 100);

    expect(img.src.startsWith("data:image/svg+xml,")).toBe(true);
    expect(img.src).not.toContain("remote.example");
    expect(img.dataset.origSrc).toBe("https://remote.example/x.jpg");
  });
});
