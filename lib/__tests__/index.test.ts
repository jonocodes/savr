import {
  mimeToExt,
  extractDomain,
  calcReadingTime,
  humanReadableSize,
  generateInfoForCard,
  generateInfoForArticle,
  renderListTemplate,
  getFilePathContent,
  getFilePathMetadata,
  getFilePathRaw,
  getFileFetchLog,
  getFilePathThumbnail,
} from "../src/lib";
import { Article } from "../src/models";

describe("lib.ts", () => {
  describe("mimeToExt", () => {
    it("should contain correct MIME type to extension mappings", () => {
      expect(mimeToExt["text/html"]).toBe("html");
      expect(mimeToExt["image/jpeg"]).toBe("jpg");
      expect(mimeToExt["image/png"]).toBe("png");
      expect(mimeToExt["image/webp"]).toBe("webp");
      expect(mimeToExt["application/pdf"]).toBe("pdf");
      expect(mimeToExt["text/plain"]).toBe("txt");
      expect(mimeToExt["text/markdown"]).toBe("md");
    });
  });

  describe("extractDomain", () => {
    it("should extract domain from valid URLs", () => {
      expect(extractDomain("https://www.example.com/path")).toBe("example.com");
      expect(extractDomain("http://example.com")).toBe("example.com");
      expect(extractDomain("https://subdomain.example.com")).toBe("subdomain.example.com");
      expect(extractDomain("https://www.news.bbc.co.uk/article")).toBe("news.bbc.co.uk");
    });

    it("should handle URLs without www prefix", () => {
      expect(extractDomain("https://github.com/user/repo")).toBe("github.com");
      expect(extractDomain("http://localhost:3002")).toBe("localhost");
    });

    it("should return null for invalid URLs", () => {
      expect(extractDomain("not-a-valid-url")).toBeNull();
      expect(extractDomain("")).toBeNull();
    });

    it("should handle edge cases", () => {
      expect(extractDomain("https://www.example.com")).toBe("example.com");
      expect(extractDomain("https://example.com/")).toBe("example.com");
      expect(extractDomain("https://example.com?param=value")).toBe("example.com");
    });
  });

  describe("calcReadingTime", () => {
    it("should calculate reading time for short text", () => {
      const shortText = "This is a short text.";
      expect(calcReadingTime(shortText)).toBe(1);
    });

    it("should calculate reading time for medium text", () => {
      const mediumText =
        "This is a medium length text with more words to test the reading time calculation. It should take about one minute to read this content.";
      expect(calcReadingTime(mediumText)).toBe(1);
    });

    it("should calculate reading time for long text", () => {
      const longText = "This is a much longer text that contains many more words. ".repeat(50);
      const expectedMinutes = Math.ceil((50 * 11) / 200); // 20 words per repeat, 200 wpm
      expect(calcReadingTime(longText)).toBe(expectedMinutes);
    });

    it("should handle empty text", () => {
      expect(calcReadingTime("")).toBe(1);
    });

    it("should handle text with multiple spaces", () => {
      const textWithSpaces = "Word1    Word2   Word3";
      expect(calcReadingTime(textWithSpaces)).toBe(1);
    });
  });

  describe("humanReadableSize", () => {
    it("should format bytes correctly", () => {
      expect(humanReadableSize(0)).toBe("0.00 B");
      expect(humanReadableSize(1024)).toBe("1.00 KB");
      expect(humanReadableSize(1024 * 1024)).toBe("1.00 MB");
      expect(humanReadableSize(1024 * 1024 * 1024)).toBe("1.00 GB");
    });

    it("should handle fractional sizes", () => {
      expect(humanReadableSize(1500)).toBe("1.46 KB");
      expect(humanReadableSize(1536)).toBe("1.50 KB");
      expect(humanReadableSize(1572864)).toBe("1.50 MB");
    });

    it("should handle very large sizes", () => {
      expect(humanReadableSize(1024 * 1024 * 1024 * 1024)).toBe("1.00 TB");
    });

    it("should handle small sizes", () => {
      expect(humanReadableSize(500)).toBe("500.00 B");
      expect(humanReadableSize(999)).toBe("999.00 B");
    });
  });

  describe("generateInfoForCard", () => {
    it("should generate info with author only", () => {
      const article: Article = {
        slug: "test",
        title: "Test Article",
        author: "John Doe",
        url: "https://example.com",
        mimeType: "text/html",
        state: "active",
      } as Article;

      expect(generateInfoForCard(article)).toBe("John Doe");
    });

    it("should generate info with published date only", () => {
      const article: Article = {
        slug: "test",
        title: "Test Article",
        url: "https://example.com",
        mimeType: "text/html",
        state: "active",
        publishedDate: "2023-01-15T10:00:00Z",
      } as Article;

      const result = generateInfoForCard(article);
      expect(result).toContain("Jan 15 2023");
    });

    it("should generate info with reading time only", () => {
      const article: Article = {
        slug: "test",
        title: "Test Article",
        url: "https://example.com",
        mimeType: "text/html",
        state: "active",
        readTimeMinutes: 5,
      } as Article;

      expect(generateInfoForCard(article)).toBe("5m");
    });

    it("should generate info with author and published date", () => {
      const article: Article = {
        slug: "test",
        title: "Test Article",
        author: "Jane Smith",
        url: "https://example.com",
        mimeType: "text/html",
        state: "active",
        publishedDate: "2023-01-15T10:00:00Z",
      } as Article;

      const result = generateInfoForCard(article);
      expect(result).toContain("Jane Smith");
      expect(result).toContain("Jan 15 2023");
    });

    it("should generate info with reading time and progress", () => {
      const article: Article = {
        slug: "test",
        title: "Test Article",
        url: "https://example.com",
        mimeType: "text/html",
        state: "active",
        readTimeMinutes: 10,
        progress: 75,
      } as Article;

      expect(generateInfoForCard(article)).toBe("10m • 75%");
    });

    it("should generate complete info with all fields", () => {
      const article: Article = {
        slug: "test",
        title: "Test Article",
        author: "Bob Wilson",
        url: "https://example.com",
        mimeType: "text/html",
        state: "active",
        publishedDate: "2023-01-15T10:00:00Z",
        readTimeMinutes: 8,
        progress: 50,
      } as Article;

      const result = generateInfoForCard(article);
      expect(result).toContain("Bob Wilson");
      expect(result).toContain("Jan 15 2023");
      expect(result).toContain("8m • 50%");
    });

    it("should handle empty author", () => {
      const article: Article = {
        slug: "test",
        title: "Test Article",
        author: "",
        url: "https://example.com",
        mimeType: "text/html",
        state: "active",
        publishedDate: "2023-01-15T10:00:00Z",
      } as Article;

      const result = generateInfoForCard(article);
      expect(result).toContain("Jan 15 2023");
      expect(result).not.toContain("Bob Wilson");
    });
  });

  describe("generateInfoForArticle", () => {
    it("should generate info with URL domain", () => {
      const article: Article = {
        slug: "test",
        title: "Test Article",
        url: "https://www.example.com/article",
        mimeType: "text/html",
        state: "active",
      } as Article;

      const result = generateInfoForArticle(article);
      expect(result).toContain("<a href=https://www.example.com/article>example.com</a>");
    });

    it("should generate info with published date only", () => {
      const article: Article = {
        slug: "test",
        title: "Test Article",
        mimeType: "text/html",
        state: "active",
        publishedDate: "2023-01-15T10:00:00Z",
      } as Article;

      const result = generateInfoForArticle(article);
      expect(result).toContain("Jan 15 2023");
    });

    it("should generate info with URL and published date", () => {
      const article: Article = {
        slug: "test",
        title: "Test Article",
        url: "https://news.bbc.co.uk/article",
        mimeType: "text/html",
        state: "active",
        publishedDate: "2023-01-15T10:00:00Z",
      } as Article;

      const result = generateInfoForArticle(article);
      expect(result).toContain("<a href=https://news.bbc.co.uk/article>news.bbc.co.uk</a>");
      expect(result).toContain("Jan 15 2023");
    });

    it("should handle article without URL or published date", () => {
      const article: Article = {
        slug: "test",
        title: "Test Article",
        mimeType: "text/html",
        state: "active",
      } as Article;

      expect(generateInfoForArticle(article)).toBe("");
    });

    it("should handle invalid URL gracefully", () => {
      const article: Article = {
        slug: "test",
        title: "Test Article",
        url: "not-a-valid-url",
        mimeType: "text/html",
        state: "active",
      } as Article;

      expect(generateInfoForArticle(article)).toBe("");
    });
  });

  describe("renderListTemplate", () => {
    it("should render template with view data", () => {
      const view = { title: "Test List", items: ["item1", "item2"] };
      const result = renderListTemplate(view);
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });

    it("should handle empty view object", () => {
      const view = {};
      const result = renderListTemplate(view);
      expect(typeof result).toBe("string");
    });
  });

  describe("file path functions", () => {
    const testSlug = "test-article";

    it("should generate correct content file path", () => {
      expect(getFilePathContent(testSlug)).toBe("saves/test-article/index.html");
    });

    it("should generate correct metadata file path", () => {
      expect(getFilePathMetadata(testSlug)).toBe("saves/test-article/article.json");
    });

    it("should generate correct raw file path", () => {
      expect(getFilePathRaw(testSlug)).toBe("saves/test-article/raw.html");
    });

    it("should generate correct fetch log file path", () => {
      expect(getFileFetchLog(testSlug)).toBe("saves/test-article/fetch.log");
    });

    it("should generate correct thumbnail file path", () => {
      expect(getFilePathThumbnail(testSlug)).toBe(
        "saves/test-article/resources/thumbnail.webp.data"
      );
    });

    it("should handle empty slug", () => {
      expect(getFilePathContent("")).toBe("saves//index.html");
      expect(getFilePathMetadata("")).toBe("saves//article.json");
    });

    it("should handle special characters in slug", () => {
      const specialSlug = "article-with-special-chars-123";
      expect(getFilePathContent(specialSlug)).toBe(
        "saves/article-with-special-chars-123/index.html"
      );
    });
  });
});
