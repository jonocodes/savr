import { detectContentType, convertToHtml, CONTENT_TYPE_OPTIONS } from "../src/contentType";

describe("contentType.ts", () => {
  describe("CONTENT_TYPE_OPTIONS", () => {
    it("should have all expected options", () => {
      expect(CONTENT_TYPE_OPTIONS).toHaveLength(4);
      expect(CONTENT_TYPE_OPTIONS.map(o => o.value)).toEqual([
        "auto",
        "text/html",
        "text/markdown",
        "text/plain",
      ]);
    });

    it("should have labels for all options", () => {
      CONTENT_TYPE_OPTIONS.forEach(option => {
        expect(option.label).toBeTruthy();
        expect(typeof option.label).toBe("string");
      });
    });
  });

  describe("detectContentType", () => {
    describe("HTML detection", () => {
      it("should detect DOCTYPE declaration", () => {
        expect(detectContentType("<!DOCTYPE html><html></html>")).toBe("text/html");
        expect(detectContentType("<!doctype HTML>")).toBe("text/html");
      });

      it("should detect html tag", () => {
        expect(detectContentType("<html><body>Hello</body></html>")).toBe("text/html");
      });

      it("should detect head tag", () => {
        expect(detectContentType("<head><title>Test</title></head>")).toBe("text/html");
      });

      it("should detect body tag", () => {
        expect(detectContentType("<body>Content here</body>")).toBe("text/html");
      });

      it("should detect common HTML elements", () => {
        expect(detectContentType("<div>Hello World</div>")).toBe("text/html");
        expect(detectContentType("<p>Paragraph text</p>")).toBe("text/html");
        expect(detectContentType("<span>Inline text</span>")).toBe("text/html");
        expect(detectContentType("<h1>Header</h1>")).toBe("text/html");
        expect(detectContentType("<ul><li>Item</li></ul>")).toBe("text/html");
        expect(detectContentType("<table><tr><td>Cell</td></tr></table>")).toBe("text/html");
        expect(detectContentType("<a href='link'>Link</a>")).toBe("text/html");
        expect(detectContentType("<img src='image.jpg'>")).toBe("text/html");
        expect(detectContentType("<title>Page Title</title>")).toBe("text/html");
      });

      it("should detect script and style tags", () => {
        expect(detectContentType("<script>console.log('hi');</script>")).toBe("text/html");
        expect(detectContentType("<style>body { color: red; }</style>")).toBe("text/html");
      });

      it("should handle whitespace before HTML", () => {
        expect(detectContentType("   <!DOCTYPE html>")).toBe("text/html");
        expect(detectContentType("\n\n<html>")).toBe("text/html");
      });

      it("should prioritize HTML over markdown-like content inside HTML", () => {
        expect(detectContentType("<div># This looks like markdown</div>")).toBe("text/html");
        expect(detectContentType("<p>**bold** and *italic*</p>")).toBe("text/html");
      });
    });

    describe("Markdown detection", () => {
      it("should detect markdown headers combined with other patterns", () => {
        // Headers combined with other markdown patterns
        expect(detectContentType("# Header 1\n\nSome **bold** content")).toBe("text/markdown");
        expect(detectContentType("## Header 2\n\n- List item")).toBe("text/markdown");
        expect(detectContentType("### Header 3\n\n[Link](url)")).toBe("text/markdown");
      });

      it("should not detect single header alone as markdown (requires 2+ patterns)", () => {
        // Single header without other markdown patterns defaults to plain text
        expect(detectContentType("# Header 1\n\nSome content")).toBe("text/plain");
        expect(detectContentType("## Header 2\n\nMore content")).toBe("text/plain");
      });

      it("should detect markdown unordered lists", () => {
        expect(detectContentType("# Title\n\n- Item 1\n- Item 2")).toBe("text/markdown");
        expect(detectContentType("# Title\n\n* Item 1\n* Item 2")).toBe("text/markdown");
        expect(detectContentType("# Title\n\n+ Item 1\n+ Item 2")).toBe("text/markdown");
      });

      it("should detect markdown ordered lists", () => {
        expect(detectContentType("# Title\n\n1. First\n2. Second")).toBe("text/markdown");
      });

      it("should detect markdown links", () => {
        expect(detectContentType("Check out [this link](https://example.com) and **bold** text")).toBe("text/markdown");
      });

      it("should detect markdown images with other patterns", () => {
        // Image alone might not be enough, combine with header
        expect(detectContentType("# Title\n\n![Alt text](image.png)")).toBe("text/markdown");
      });

      it("should detect markdown blockquotes", () => {
        expect(detectContentType("> This is a quote\n\nAnd **bold** text")).toBe("text/markdown");
      });

      it("should detect inline code", () => {
        expect(detectContentType("Use `code` here\n\n# Header")).toBe("text/markdown");
      });

      it("should detect fenced code blocks", () => {
        expect(detectContentType("```javascript\nconst x = 1;\n```\n\n# Title")).toBe("text/markdown");
      });

      it("should detect bold and italic text", () => {
        expect(detectContentType("**Bold** and *italic* text with [link](url)")).toBe("text/markdown");
        expect(detectContentType("__Bold__ and _italic_ with [link](url)")).toBe("text/markdown");
      });

      it("should detect strikethrough", () => {
        expect(detectContentType("~~strikethrough~~ text with **bold**")).toBe("text/markdown");
      });

      it("should detect horizontal rules", () => {
        expect(detectContentType("Some text\n\n---\n\nMore text with **bold**")).toBe("text/markdown");
        expect(detectContentType("# Header\n\n***\n\nContent")).toBe("text/markdown");
      });

      it("should require multiple markdown patterns for detection", () => {
        // Single pattern alone might be ambiguous
        expect(detectContentType("Just a single * character")).toBe("text/plain");
        expect(detectContentType("Some text with a-dash")).toBe("text/plain");
      });
    });

    describe("Plain text detection", () => {
      it("should return plain text for regular text without markup", () => {
        expect(detectContentType("Hello, this is plain text.")).toBe("text/plain");
        expect(detectContentType("Multiple lines\nof plain\ntext")).toBe("text/plain");
      });

      it("should return plain text for empty or whitespace-only content", () => {
        expect(detectContentType("")).toBe("text/plain");
        expect(detectContentType("   ")).toBe("text/plain");
        expect(detectContentType("\n\n\n")).toBe("text/plain");
      });

      it("should return plain text when markup patterns are insufficient", () => {
        expect(detectContentType("This has one asterisk *")).toBe("text/plain");
        expect(detectContentType("Number 1. at the end")).toBe("text/plain");
      });

      it("should handle edge cases", () => {
        expect(detectContentType("Email: user@example.com")).toBe("text/plain");
        expect(detectContentType("Price: $100")).toBe("text/plain");
        expect(detectContentType("50% discount!")).toBe("text/plain");
      });
    });
  });

  describe("convertToHtml", () => {
    describe("HTML passthrough", () => {
      it("should return HTML content unchanged", () => {
        const html = "<div><p>Hello World</p></div>";
        expect(convertToHtml(html, "text/html")).toBe(html);
      });

      it("should preserve complex HTML", () => {
        const html = "<!DOCTYPE html><html><head><title>Test</title></head><body><h1>Hello</h1></body></html>";
        expect(convertToHtml(html, "text/html")).toBe(html);
      });
    });

    describe("Markdown conversion", () => {
      it("should convert markdown headers to HTML", () => {
        const result = convertToHtml("# Hello World", "text/markdown");
        expect(result).toContain("<h1");
        expect(result).toContain("Hello World");
        expect(result).toContain("<title>Hello World</title>");
      });

      it("should convert markdown paragraphs", () => {
        const result = convertToHtml("# Title\n\nThis is a paragraph.", "text/markdown");
        expect(result).toContain("<p>");
        expect(result).toContain("This is a paragraph.");
      });

      it("should convert markdown bold and italic", () => {
        const result = convertToHtml("# Test\n\n**bold** and *italic*", "text/markdown");
        expect(result).toContain("<strong>bold</strong>");
        expect(result).toContain("<em>italic</em>");
      });

      it("should convert markdown links", () => {
        const result = convertToHtml("# Test\n\n[Example](https://example.com)", "text/markdown");
        expect(result).toContain('<a href="https://example.com"');
        expect(result).toContain("Example</a>");
      });

      it("should convert markdown lists", () => {
        const result = convertToHtml("# Test\n\n- Item 1\n- Item 2", "text/markdown");
        expect(result).toContain("<ul>");
        expect(result).toContain("<li>");
        expect(result).toContain("Item 1");
        expect(result).toContain("Item 2");
      });

      it("should convert markdown code blocks", () => {
        const result = convertToHtml("# Test\n\n```\ncode here\n```", "text/markdown");
        expect(result).toContain("<code>");
        expect(result).toContain("code here");
      });

      it("should convert markdown blockquotes", () => {
        const result = convertToHtml("# Test\n\n> This is a quote", "text/markdown");
        expect(result).toContain("<blockquote>");
        expect(result).toContain("This is a quote");
      });

      it("should extract title from first h1", () => {
        const result = convertToHtml("# My Article Title\n\nContent here", "text/markdown");
        expect(result).toContain("<title>My Article Title</title>");
      });

      it("should use default title when no h1 present", () => {
        const result = convertToHtml("Just some content without headers", "text/markdown");
        expect(result).toContain("<title>Imported Markdown</title>");
      });

      it("should convert markdown tables", () => {
        const markdown = "# Test\n\n| Header 1 | Header 2 |\n|----------|----------|\n| Cell 1   | Cell 2   |";
        const result = convertToHtml(markdown, "text/markdown");
        expect(result).toContain("<table>");
        expect(result).toContain("<th>");
        expect(result).toContain("Header 1");
      });

      it("should convert markdown strikethrough", () => {
        const result = convertToHtml("# Test\n\n~~strikethrough~~", "text/markdown");
        expect(result).toContain("<del>strikethrough</del>");
      });
    });

    describe("Plain text conversion", () => {
      it("should wrap plain text in pre tags", () => {
        const result = convertToHtml("Hello World", "text/plain");
        expect(result).toContain("<pre");
        expect(result).toContain("Hello World");
        expect(result).toContain("</pre>");
      });

      it("should escape HTML entities", () => {
        const result = convertToHtml("<script>alert('xss')</script>", "text/plain");
        expect(result).toContain("&lt;script&gt;");
        expect(result).toContain("&lt;/script&gt;");
        expect(result).not.toContain("<script>");
      });

      it("should escape ampersands", () => {
        const result = convertToHtml("Tom & Jerry", "text/plain");
        expect(result).toContain("Tom &amp; Jerry");
      });

      it("should escape quotes", () => {
        const result = convertToHtml('He said "hello"', "text/plain");
        expect(result).toContain("&quot;hello&quot;");
      });

      it("should escape single quotes", () => {
        const result = convertToHtml("It's a test", "text/plain");
        expect(result).toContain("It&#039;s a test");
      });

      it("should use first line as title when short enough", () => {
        const result = convertToHtml("My Title\n\nSome content here", "text/plain");
        expect(result).toContain("<title>My Title</title>");
      });

      it("should use default title when first line is too long", () => {
        const longFirstLine = "A".repeat(150);
        const result = convertToHtml(longFirstLine + "\n\nContent", "text/plain");
        expect(result).toContain("<title>Imported Text</title>");
      });

      it("should use default title for empty content", () => {
        const result = convertToHtml("", "text/plain");
        expect(result).toContain("<title>Imported Text</title>");
      });

      it("should preserve whitespace with pre tag styling", () => {
        const result = convertToHtml("Line 1\n  Indented line\n    More indent", "text/plain");
        expect(result).toContain("white-space: pre-wrap");
        expect(result).toContain("word-wrap: break-word");
      });
    });

    describe("Edge cases", () => {
      it("should handle unknown content type by returning content as-is", () => {
        // TypeScript should prevent this, but testing runtime behavior
        const result = convertToHtml("test content", "unknown/type" as any);
        expect(result).toBe("test content");
      });

      it("should handle content with mixed patterns", () => {
        // Content that looks like markdown but is specified as plain text
        const markdown = "# Header\n\n**bold**";
        const result = convertToHtml(markdown, "text/plain");
        expect(result).toContain("# Header");
        expect(result).toContain("**bold**");
        expect(result).not.toContain("<h1");
      });
    });
  });
});
