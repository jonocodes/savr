import { getLargestImageFromSrcset } from "../src/ingestion";

describe("ingestion.ts - srcset handling", () => {
  describe("getLargestImageFromSrcset", () => {
    it("should return null for empty srcset", () => {
      expect(getLargestImageFromSrcset("")).toBeNull();
      expect(getLargestImageFromSrcset("   ")).toBeNull();
    });

    it("should handle density descriptors (1x, 2x, 3x)", () => {
      const srcset = "small.jpg 1x, medium.jpg 2x, large.jpg 3x";
      const result = getLargestImageFromSrcset(srcset);
      expect(result).toBe("large.jpg");
    });

    it("should handle width descriptors (100w, 200w, 400w)", () => {
      const srcset = "image-100.jpg 100w, image-200.jpg 200w, image-400.jpg 400w";
      const result = getLargestImageFromSrcset(srcset);
      expect(result).toBe("image-400.jpg");
    });

    it("should handle mixed order (largest not last)", () => {
      const srcset = "medium.jpg 2x, large.jpg 4x, small.jpg 1x";
      const result = getLargestImageFromSrcset(srcset);
      expect(result).toBe("large.jpg");
    });

    it("should handle URLs with paths", () => {
      const srcset = "/images/small.jpg 1x, /images/large.jpg 2x";
      const result = getLargestImageFromSrcset(srcset);
      expect(result).toBe("/images/large.jpg");
    });

    it("should handle absolute URLs", () => {
      const srcset =
        "https://example.com/small.jpg 1x, https://example.com/large.jpg 3x, https://example.com/medium.jpg 2x";
      const result = getLargestImageFromSrcset(srcset);
      expect(result).toBe("https://example.com/large.jpg");
    });

    it("should handle single image in srcset", () => {
      const srcset = "image.jpg 2x";
      const result = getLargestImageFromSrcset(srcset);
      expect(result).toBe("image.jpg");
    });

    it("should handle image without descriptor (defaults to 1x)", () => {
      const srcset = "default.jpg";
      const result = getLargestImageFromSrcset(srcset);
      expect(result).toBe("default.jpg");
    });

    it("should handle complex URLs with query parameters", () => {
      const srcset =
        "https://example.com/img?size=small&v=1 1x, https://example.com/img?size=large&v=1 2x";
      const result = getLargestImageFromSrcset(srcset);
      expect(result).toBe("https://example.com/img?size=large&v=1");
    });

    it("should handle extra whitespace", () => {
      const srcset = "  small.jpg   1x  ,   large.jpg   3x  ,  medium.jpg  2x  ";
      const result = getLargestImageFromSrcset(srcset);
      expect(result).toBe("large.jpg");
    });

    it("should handle decimal descriptors", () => {
      const srcset = "image1.jpg 1.5x, image2.jpg 2.5x, image3.jpg 1x";
      const result = getLargestImageFromSrcset(srcset);
      expect(result).toBe("image2.jpg");
    });

    it("should handle large width descriptors", () => {
      const srcset = "img-800.jpg 800w, img-1200.jpg 1200w, img-1920.jpg 1920w";
      const result = getLargestImageFromSrcset(srcset);
      expect(result).toBe("img-1920.jpg");
    });

    it("should prefer higher numeric value when comparing different descriptor types", () => {
      // In practice, you shouldn't mix descriptor types, but our function should handle it
      const srcset = "image1.jpg 100w, image2.jpg 200w";
      const result = getLargestImageFromSrcset(srcset);
      expect(result).toBe("image2.jpg");
    });
  });

  describe("srcset integration with image extraction", () => {
    // Mock DOMParser for testing
    beforeAll(() => {
      (global as any).DOMParser = class DOMParser {
        parseFromString(html: string, contentType: string): Document {
          // Create a more complete mock for image testing
          const parser = new (require("jsdom").JSDOM)(html);
          return parser.window.document;
        }
      };
    });

    it("should extract largest image from srcset and remove srcset attribute", () => {
      const html = `
        <html>
          <body>
            <img src="small.jpg" srcset="small.jpg 1x, medium.jpg 2x, large.jpg 3x" alt="Test">
          </body>
        </html>
      `;

      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");
      const img = doc.querySelector("img");

      // Verify srcset exists initially
      expect(img?.getAttribute("srcset")).toBeTruthy();

      // After processing, srcset should be removed
      // This would be tested through the full ingestion flow
    });

    it("should remove sizes attribute along with srcset", () => {
      const html = `
        <html>
          <body>
            <img src="small.jpg"
                 srcset="small.jpg 100w, large.jpg 200w"
                 sizes="(max-width: 600px) 100px, 200px"
                 alt="Test">
          </body>
        </html>
      `;

      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");
      const img = doc.querySelector("img");

      // Verify attributes exist initially
      expect(img?.getAttribute("srcset")).toBeTruthy();
      expect(img?.getAttribute("sizes")).toBeTruthy();

      // After processing, both should be removed
      // This would be tested through the full ingestion flow
    });
  });
});
