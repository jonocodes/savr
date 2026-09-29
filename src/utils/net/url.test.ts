import { normalizeUrl } from "./url";

describe("normalizeUrl", () => {
  it("prepends https to a bare host", () => {
    expect(normalizeUrl("example.com/article")).toBe("https://example.com/article");
  });

  it("prepends https to a bare host with www", () => {
    expect(normalizeUrl("www.example.com")).toBe("https://www.example.com");
  });

  it("keeps an explicit http(s) scheme", () => {
    expect(normalizeUrl("http://example.com/a")).toBe("http://example.com/a");
    expect(normalizeUrl("https://example.com/a")).toBe("https://example.com/a");
  });

  it("keeps a non-http scheme untouched", () => {
    expect(normalizeUrl("mailto:someone@example.com")).toBe("mailto:someone@example.com");
  });

  it("treats a host with a port as schemeless rather than as a scheme", () => {
    expect(normalizeUrl("example.com:8080/article")).toBe("https://example.com:8080/article");
    expect(normalizeUrl("localhost:9101/missing.html")).toBe("https://localhost:9101/missing.html");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeUrl("  example.com/a  ")).toBe("https://example.com/a");
  });

  it("upgrades a protocol-relative url to https", () => {
    expect(normalizeUrl("//example.com/a")).toBe("https://example.com/a");
  });

  it("returns an empty string unchanged", () => {
    expect(normalizeUrl("   ")).toBe("");
  });

  it("is case-insensitive about the scheme", () => {
    expect(normalizeUrl("HTTPS://example.com/a")).toBe("HTTPS://example.com/a");
  });
});
