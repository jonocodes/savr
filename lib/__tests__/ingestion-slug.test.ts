/**
 * Tests for finalizeSlug: empty-slug fallback and collision disambiguation.
 *
 * Slugs are derived from titles, which historically had two failure modes:
 * - titles with no Latin characters slugified to "" (article written to
 *   "saves//" and dropped by the reconciler)
 * - two different articles with the same title silently overwrote each other
 */

import { finalizeSlug } from "../src/ingestion";
import { getFilePathMetadata } from "../src/lib";
import { Article } from "../src/models";

function makeArticle(overrides: Partial<Article>): Article {
  return {
    slug: "",
    title: "",
    url: null,
    state: "unread",
    publication: null,
    author: null,
    publishedDate: null,
    ingestDate: new Date().toISOString(),
    ingestPlatform: "test",
    ingestSource: "url",
    mimeType: "text/html",
    wordCount: null,
    progress: 0,
    ...overrides,
  } as Article;
}

function mockClient(existingMetadata: Record<string, object>) {
  return {
    getFile: jest.fn(async (path: string) => {
      const meta = existingMetadata[path];
      return meta ? { data: JSON.stringify(meta) } : null;
    }),
  } as never;
}

describe("finalizeSlug", () => {
  it("falls back to a plain 'article' slug when the slug is empty (non-Latin title)", async () => {
    const client = mockClient({});
    const a = makeArticle({ slug: "", title: "中文标题", url: "https://example.com/a" });

    await finalizeSlug(client, a);

    expect(a.slug).toBe("article");
  });

  it("disambiguates the empty-slug fallback only when it is already taken", async () => {
    const client = mockClient({
      [getFilePathMetadata("article")]: { slug: "article", url: "https://example.com/a" },
    });
    const b = makeArticle({ slug: "", title: "中文标题", url: "https://example.com/b" });

    await finalizeSlug(client, b);

    expect(b.slug).toMatch(/^article-[0-9a-f]{6}$/);
  });

  it("keeps the empty-slug fallback when re-ingesting the same url (idempotent)", async () => {
    const client = mockClient({
      [getFilePathMetadata("article")]: { slug: "article", url: "https://example.com/a" },
    });
    const a = makeArticle({ slug: "", title: "中文标题", url: "https://example.com/a" });

    await finalizeSlug(client, a);

    expect(a.slug).toBe("article");
  });

  it("keeps the slug when no article exists at that slug", async () => {
    const client = mockClient({});
    const a = makeArticle({ slug: "my-article", title: "My Article", url: "https://example.com/a" });

    await finalizeSlug(client, a);

    expect(a.slug).toBe("my-article");
  });

  it("keeps the slug when re-ingesting the same url (idempotent)", async () => {
    const client = mockClient({
      [getFilePathMetadata("my-article")]: { slug: "my-article", url: "https://example.com/a" },
    });
    const a = makeArticle({ slug: "my-article", title: "My Article", url: "https://example.com/a" });

    await finalizeSlug(client, a);

    expect(a.slug).toBe("my-article");
  });

  it("appends a hash suffix when the slug is taken by a different url", async () => {
    const client = mockClient({
      [getFilePathMetadata("my-article")]: { slug: "my-article", url: "https://other.com/x" },
    });
    const a = makeArticle({ slug: "my-article", title: "My Article", url: "https://example.com/a" });

    await finalizeSlug(client, a);

    expect(a.slug).toMatch(/^my-article-[0-9a-f]{6}$/);
  });

  it("appends a hash suffix when the slug is taken and the new article has no url (local file)", async () => {
    const client = mockClient({
      [getFilePathMetadata("my-article")]: { slug: "my-article", url: "https://other.com/x" },
    });
    const a = makeArticle({ slug: "my-article", title: "My Article", url: null });

    await finalizeSlug(client, a);

    expect(a.slug).toMatch(/^my-article-[0-9a-f]{6}$/);
  });

  it("survives unreadable existing metadata", async () => {
    const client = {
      getFile: jest.fn(async () => ({ data: "not json{{" })),
    } as never;
    const a = makeArticle({ slug: "my-article", title: "My Article", url: "https://example.com/a" });

    await finalizeSlug(client, a);

    expect(a.slug).toBe("my-article");
  });
});
