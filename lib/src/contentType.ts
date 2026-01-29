import Showdown from "showdown";

// Content type options for the dropdown
export type ContentTypeOption = "auto" | "text/html" | "text/markdown" | "text/plain";

export const CONTENT_TYPE_OPTIONS: { value: ContentTypeOption; label: string }[] = [
  { value: "auto", label: "Auto-detect" },
  { value: "text/html", label: "HTML" },
  { value: "text/markdown", label: "Markdown" },
  { value: "text/plain", label: "Plain Text" },
];

/**
 * Auto-detect content type based on content patterns
 */
export function detectContentType(content: string): "text/html" | "text/markdown" | "text/plain" {
  const trimmed = content.trim();

  // Check for HTML: look for DOCTYPE, or any HTML tags
  const htmlPatterns = [
    /^<!DOCTYPE\s+html/i,
    /<html[\s>]/i,
    /<head[\s>]/i,
    /<body[\s>]/i,
    /<(div|span|p|h[1-6]|ul|ol|li|table|form|a|img|script|style|link|meta|title)[\s>]/i,
  ];

  for (const pattern of htmlPatterns) {
    if (pattern.test(trimmed)) {
      return "text/html";
    }
  }

  // Check for Markdown patterns
  const markdownPatterns = [
    /^#{1,6}\s+\S/m,           // Headers: # Header
    /^\s*[-*+]\s+\S/m,         // Unordered lists: - item, * item, + item
    /^\s*\d+\.\s+\S/m,         // Ordered lists: 1. item
    /\[.+?\]\(.+?\)/,          // Links: [text](url)
    /!\[.*?\]\(.+?\)/,         // Images: ![alt](url)
    /^>\s+\S/m,                // Blockquotes: > quote
    /`{1,3}[^`]+`{1,3}/,       // Inline code or code blocks
    /^\s*```/m,                // Fenced code blocks
    /\*\*[^*]+\*\*/,           // Bold: **text**
    /\*[^*]+\*/,               // Italic: *text*
    /__[^_]+__/,               // Bold: __text__
    /_[^_]+_/,                 // Italic: _text_
    /~~[^~]+~~/,               // Strikethrough: ~~text~~
    /^\s*[-*_]{3,}\s*$/m,      // Horizontal rules: ---, ***, ___
  ];

  let markdownScore = 0;
  for (const pattern of markdownPatterns) {
    if (pattern.test(trimmed)) {
      markdownScore++;
    }
  }

  // If multiple markdown patterns match, likely markdown
  if (markdownScore >= 2) {
    return "text/markdown";
  }

  // Default to plain text
  return "text/plain";
}

/**
 * Convert content to HTML based on its type
 */
export function convertToHtml(content: string, contentType: "text/html" | "text/markdown" | "text/plain"): string {
  switch (contentType) {
    case "text/html":
      return content;

    case "text/markdown": {
      const converter = new Showdown.Converter({
        tables: true,
        tasklists: true,
        strikethrough: true,
        ghCodeBlocks: true,
        emoji: true,
        simplifiedAutoLink: true,
      });
      const htmlContent = converter.makeHtml(content);
      // Wrap in basic HTML structure if not already present
      if (!htmlContent.includes("<title>")) {
        // Try to extract title from first h1 or first line
        const titleMatch = content.match(/^#\s+(.+)$/m);
        const title = titleMatch ? titleMatch[1] : "Imported Markdown";
        return `<title>${title}</title>${htmlContent}`;
      }
      return htmlContent;
    }

    case "text/plain": {
      // Helper function to escape HTML entities
      const escapeHtml = (str: string) => str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

      // Extract title from first line if it's short enough
      const lines = content.split("\n");
      const firstLine = lines[0]?.trim() || "";
      const rawTitle = firstLine.length > 0 && firstLine.length < 100
        ? firstLine
        : "Imported Text";
      const title = escapeHtml(rawTitle);

      // Wrap plain text in pre tags to preserve formatting, escape HTML
      const escaped = escapeHtml(content);

      return `<title>${title}</title><pre style="white-space: pre-wrap; word-wrap: break-word; font-family: inherit;">${escaped}</pre>`;
    }

    default:
      return content;
  }
}
