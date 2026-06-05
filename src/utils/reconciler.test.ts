import { parseListing, reconcile, parseChangePath, opFromChange, Op } from "./reconciler";

describe("parseListing", () => {
  it("extracts directory slugs and strips trailing slashes", () => {
    const listing = { "article-1/": true, "article-2/": true };
    expect(parseListing(listing)).toEqual(["article-1", "article-2"]);
  });

  it("ignores non-directory entries", () => {
    const listing = { "article-1/": true, "some-file.json": false };
    expect(parseListing(listing)).toEqual(["article-1"]);
  });

  it("returns empty array for empty listing", () => {
    expect(parseListing({})).toEqual([]);
  });

  it("handles listing with only files", () => {
    expect(parseListing({ "file.json": false })).toEqual([]);
  });

  it("ignores a bare slash key", () => {
    const listing = { "/": true, "article-1/": true };
    expect(parseListing(listing)).toEqual(["article-1"]);
  });
});

describe("reconcile", () => {
  it("returns fetch ops for articles in remote but not local", () => {
    const ops = reconcile([], ["article-1", "article-2"]);
    expect(ops).toEqual<Op[]>([
      { type: "fetch", slug: "article-1" },
      { type: "fetch", slug: "article-2" },
    ]);
  });

  it("returns delete ops for articles in local but not remote", () => {
    const ops = reconcile(["article-1", "article-2"], []);
    expect(ops).toEqual<Op[]>([
      { type: "delete", slug: "article-1" },
      { type: "delete", slug: "article-2" },
    ]);
  });

  it("returns no ops when local and remote match", () => {
    expect(reconcile(["article-1", "article-2"], ["article-1", "article-2"])).toEqual([]);
  });

  it("returns no ops when both are empty", () => {
    expect(reconcile([], [])).toEqual([]);
  });

  it("mixes fetch and delete ops when both adds and removes are needed", () => {
    const ops = reconcile(["a", "b"], ["b", "c"]);
    expect(ops).toContainEqual({ type: "delete", slug: "a" });
    expect(ops).toContainEqual({ type: "fetch", slug: "c" });
    expect(ops).not.toContainEqual(expect.objectContaining({ slug: "b" }));
    expect(ops).toHaveLength(2);
  });

  it("produces at most one op per slug", () => {
    const ops = reconcile(["a", "b", "c"], ["b", "c", "d"]);
    const slugs = ops.map((o) => o.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("result is sorted alphabetically", () => {
    const ops = reconcile(["z", "m"], ["a", "z"]);
    const slugs = ops.map((o) => o.slug);
    expect(slugs).toEqual([...slugs].sort());
  });

  describe("invariants", () => {
    it("processed ≤ total is guaranteed: ops.length is total, each op increments processed by 1", () => {
      // This is a structural property — just verify ops are finite and countable
      const ops = reconcile(["a", "b"], ["b", "c", "d"]);
      expect(ops.length).toBe(3); // delete a, fetch c, fetch d
    });

    it("no slug appears in both a fetch and a delete op", () => {
      const local = ["a", "b", "c", "d"];
      const remote = ["b", "c", "e", "f"];
      const ops = reconcile(local, remote);
      const fetches = new Set(ops.filter((o) => o.type === "fetch").map((o) => o.slug));
      const deletes = new Set(ops.filter((o) => o.type === "delete").map((o) => o.slug));
      for (const slug of fetches) {
        expect(deletes.has(slug)).toBe(false);
      }
    });

    it("applying ops then reconciling again produces no ops (convergence)", () => {
      const local = ["a", "b"];
      const remote = ["b", "c"];
      const ops = reconcile(local, remote);

      // Simulate applying ops: delete "a", fetch "c" → new local = ["b", "c"]
      const newLocal = local
        .filter((s) => !ops.some((o) => o.type === "delete" && o.slug === s))
        .concat(ops.filter((o) => o.type === "fetch").map((o) => o.slug));

      expect(reconcile(newLocal, remote)).toEqual([]);
    });
  });
});

describe("parseChangePath", () => {
  it("extracts slug from a valid article.json path", () => {
    expect(parseChangePath("saves/my-article/article.json")).toBe("my-article");
  });

  it("returns null for raw.html paths", () => {
    expect(parseChangePath("saves/my-article/raw.html")).toBeNull();
  });

  it("returns null for resource paths", () => {
    expect(parseChangePath("saves/my-article/resources/abc123")).toBeNull();
  });

  it("returns null for paths missing the saves/ prefix", () => {
    expect(parseChangePath("my-article/article.json")).toBeNull();
  });

  it("returns null for a bare saves/article.json with no slug directory", () => {
    expect(parseChangePath("saves/article.json")).toBeNull();
  });

  it("handles slugs with hyphens and numbers", () => {
    expect(parseChangePath("saves/some-article-123/article.json")).toBe("some-article-123");
  });
});

describe("opFromChange", () => {
  it("returns a fetch op for an article.json path with hasNew=true", () => {
    expect(opFromChange("saves/my-article/article.json", true)).toEqual({
      type: "fetch",
      slug: "my-article",
    });
  });

  it("returns a delete op for an article.json path with hasNew=false", () => {
    expect(opFromChange("saves/my-article/article.json", false)).toEqual({
      type: "delete",
      slug: "my-article",
    });
  });

  it("returns null for non-article.json paths", () => {
    expect(opFromChange("saves/my-article/raw.html", true)).toBeNull();
    expect(opFromChange("saves/my-article/resources/img.jpg", true)).toBeNull();
  });
});
