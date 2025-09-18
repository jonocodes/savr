import { readabilityToArticle } from "../src/ingestion";
import { Article } from "../src/models";

// Mock DOMParser for Node.js environment
(global as any).DOMParser = class DOMParser {
  parseFromString(string: string, contentType: string): Document {
    // Create a minimal mock document
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
    } as any;

    return doc;
  }
};

// Import the flexible mock
const { __setMockReadability } = require("@mozilla/readability");

describe("ingestion.ts - readabilityToArticle", () => {
  beforeEach(() => {
    // Reset to default mock
    __setMockReadability({
      title: "Test Article Title",
      content: "<p>This is test content with some words to test reading time calculation.</p>",
      length: 100,
      byline: "Test Author",
      publishedTime: "2023-01-15T10:00:00Z",
    });
  });

  afterEach(() => {
    // Clean up if needed
  });

  describe("readabilityToArticle", () => {
    it("should create article with basic HTML content", () => {
      const html =
        "<html><body><h1>Test Article</h1><p>Content here</p><img src='https://example.com/image1.jpg' alt='Test Image 1'><img src='https://example.com/image2.png' alt='Test Image 2'></body></html>";
      const contentType = "text/html";
      const url = "https://example.com/article";

      const [article, content] = readabilityToArticle(html, contentType, url);

      expect(article).toBeDefined();
      expect(content).toBeDefined();
      expect(article.title).toBe("Test Article Title");
      expect(article.author).toBe("Test Author");
      expect(article.url).toBe(url);
      expect(article.mimeType).toBe(contentType);
      expect(article.state).toBe("unread");
      expect(article.progress).toBe(0);
    });

    it("should generate slug from title", () => {
      const html =
        "<html><body><h1>Test Article Title</h1><img src='https://example.com/header.jpg' alt='Header Image'></body></html>";
      const contentType = "text/html";
      const url = "https://example.com/article";

      const [article] = readabilityToArticle(html, contentType, url);

      expect(article.slug).toBe("test-article-title");
    });

    it("should handle HTML content with special characters in title", () => {
      // Set mock to return title with special characters
      __setMockReadability({
        title: "Test Article: With Special Chars & Numbers 123",
        content:
          "<p>This is test content.</p><img src='https://example.com/special.jpg' alt='Special Image'>",
        length: 100,
        byline: "Test Author",
        publishedTime: "2023-01-15T10:00:00Z",
      });

      const html =
        "<html><body><h1>Test Article: With Special Chars & Numbers 123</h1><img src='https://example.com/special.jpg' alt='Special Image'></body></html>";
      const contentType = "text/html";
      const url = "https://example.com/article";

      const [article] = readabilityToArticle(html, contentType, url);

      expect(article.slug).toBe("test-article-with-special-chars-numbers-123");
    });

    it("should handle HTML content with accented characters in title", () => {
      // Set mock to return title with accented characters
      __setMockReadability({
        title: "Test Article with Accents: café, naïve, résumé",
        content:
          "<p>This is test content.</p><img src='https://example.com/accent.jpg' alt='Accent Image'>",
        length: 100,
        byline: "Test Author",
        publishedTime: "2023-01-15T10:00:00Z",
      });

      const html =
        "<html><body><h1>Test Article with Accents: café, naïve, résumé</h1><img src='https://example.com/accent.jpg' alt='Accent Image'></body></html>";
      const contentType = "text/html";
      const url = "https://example.com/article";

      const [article] = readabilityToArticle(html, contentType, url);

      expect(article.slug).toBe("test-article-with-accents-cafe-naive-resume");
    });

    it("should calculate reading time from content", () => {
      const html =
        "<html><body><h1>Test Article</h1><p>This is a longer article with more words to test the reading time calculation. It should take about one minute to read this content because it has enough words to exceed the minimum threshold.</p><img src='https://example.com/content1.jpg' alt='Content Image 1'><img src='https://example.com/content2.png' alt='Content Image 2'><img src='https://example.com/content3.webp' alt='Content Image 3'></body></html>";
      const contentType = "text/html";
      const url = "https://example.com/article";

      const [article] = readabilityToArticle(html, contentType, url);

      expect(article.readTimeMinutes).toBeGreaterThan(0);
      expect(typeof article.readTimeMinutes).toBe("number");
    });

    it("should handle null URL", () => {
      const html =
        "<html><body><h1>Test Article</h1><img src='https://example.com/null.jpg' alt='Null URL Image'></body></html>";
      const contentType = "text/html";
      const url = null;

      const [article] = readabilityToArticle(html, contentType, url);

      expect(article.url).toBeNull();
    });

    it("should handle different content types", () => {
      const html =
        "<html><body><h1>Test Article</h1><img src='https://example.com/markdown.jpg' alt='Markdown Image'></body></html>";
      const contentType = "text/markdown";
      const url = "https://example.com/article";

      const [article] = readabilityToArticle(html, contentType, url);

      expect(article.mimeType).toBe("text/markdown");
    });

    it("should set ingest date to current time", () => {
      const html =
        "<html><body><h1>Test Article</h1><img src='https://example.com/time.jpg' alt='Time Image'></body></html>";
      const contentType = "text/html";
      const url = "https://example.com/article";

      const beforeIngest = new Date();
      const [article] = readabilityToArticle(html, contentType, url);
      const afterIngest = new Date();

      const ingestDate = new Date(article.ingestDate!);
      expect(ingestDate.getTime()).toBeGreaterThanOrEqual(beforeIngest.getTime());
      expect(ingestDate.getTime()).toBeLessThanOrEqual(afterIngest.getTime());
    });

    it("should set ingest platform with version", () => {
      const html =
        "<html><body><h1>Test Article</h1><img src='https://example.com/platform.jpg' alt='Platform Image'></body></html>";
      const contentType = "text/html";
      const url = "https://example.com/article";

      const [article] = readabilityToArticle(html, contentType, url);

      expect(article.ingestPlatform).toContain("typescript/web");
      expect(article.ingestPlatform).toContain("(");
      expect(article.ingestPlatform).toContain(")");
    });

    it("should handle published date from readability result", () => {
      const html =
        "<html><body><h1>Test Article</h1><img src='https://example.com/date.jpg' alt='Date Image'></body></html>";
      const contentType = "text/html";
      const url = "https://example.com/article";

      const [article] = readabilityToArticle(html, contentType, url);

      // Check that the date contains the expected parts, accounting for timezone differences
      expect(article.publishedDate).toContain("2023-01-15");
      expect(article.publishedDate).toContain("10:00:00");
    });

    it("should handle empty byline (no author)", () => {
      // Set mock to return empty byline
      __setMockReadability({
        title: "Test Article Title",
        content:
          "<p>This is test content.</p><img src='https://example.com/noauthor.jpg' alt='No Author Image'>",
        length: 100,
        byline: "",
        publishedTime: "2023-01-15T10:00:00Z",
      });

      const html =
        "<html><body><h1>Test Article</h1><img src='https://example.com/image1.jpg' alt='Test Image 1'><img src='https://example.com/image2.png' alt='Test Image 2'></body></html>";
      const contentType = "text/html";
      const url = "https://example.com/article";

      const [article] = readabilityToArticle(html, contentType, url);

      expect(article.author).toBe("");
    });

    it("should handle invalid published time", () => {
      // Set mock to return invalid published time
      __setMockReadability({
        title: "Test Article Title",
        content:
          "<p>This is test content.</p><img src='https://example.com/invalid.jpg' alt='Invalid Date Image'>",
        length: 100,
        byline: "Test Author",
        publishedTime: "invalid-date",
      });

      const html =
        "<html><body><h1>Test Article</h1><img src='https://example.com/invalid.jpg' alt='Invalid Date Image'></body></html>";
      const contentType = "text/html";
      const url = "https://example.com/article";

      const [article] = readabilityToArticle(html, contentType, url);

      expect(article.publishedDate).toBeUndefined();
    });

    it("should return content from readability result", () => {
      const html =
        "<html><body><h1>Test Article</h1><img src='https://example.com/content.jpg' alt='Content Image'></body></html>";
      const contentType = "text/html";
      const url = "https://example.com/article";

      const [article, content] = readabilityToArticle(html, contentType, url);

      expect(content).toBe(
        "<p>This is test content with some words to test reading time calculation.</p>"
      );
    });

    it("should handle title with only whitespace", () => {
      // Set mock to return empty title
      __setMockReadability({
        title: "   ",
        content:
          "<p>This is test content.</p><img src='https://example.com/whitespace.jpg' alt='Whitespace Image'>",
        length: 100,
        byline: "Test Author",
        publishedTime: "2023-01-15T10:00:00Z",
      });

      const html =
        "<html><body><h1>Test Article</h1><img src='https://example.com/image1.jpg' alt='Test Image 1'><img src='https://example.com/image2.png' alt='Test Image 2'></body></html>";
      const contentType = "text/html";
      const url = "https://example.com/article";

      const [article] = readabilityToArticle(html, contentType, url);

      // The function should handle whitespace titles properly
      expect(article.title).toBe("   ");
    });

    it("should handle HTML with various image formats and relative URLs", () => {
      const html =
        "<html><body><h1>Test Article with Images</h1><img src='https://example.com/absolute.jpg' alt='Absolute URL'><img src='/relative/path/image.png' alt='Relative Path'><img src='image.gif' alt='Relative Image'><img src='../parent/image.webp' alt='Parent Directory'></body></html>";
      const contentType = "text/html";
      const url = "https://example.com/article";

      const [article] = readabilityToArticle(html, contentType, url);

      expect(article).toBeDefined();
      expect(article.title).toBe("Test Article Title");
      expect(article.mimeType).toBe(contentType);
    });

    it("should handle HTML with images that have no alt text", () => {
      const html =
        "<html><body><h1>Test Article with Images</h1><img src='https://example.com/noalt1.jpg'><img src='https://example.com/noalt2.png'><img src='https://example.com/noalt3.webp'></body></html>";
      const contentType = "text/html";
      const url = "https://example.com/article";

      const [article] = readabilityToArticle(html, contentType, url);

      expect(article).toBeDefined();
      expect(article.title).toBe("Test Article Title");
    });
  });
});
