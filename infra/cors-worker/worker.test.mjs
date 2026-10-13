import test from "node:test";
import assert from "node:assert/strict";
import worker from "./worker.js";

const PROXY = "https://proxy.test/";

function proxyRequest(target, init = {}) {
  return new Request(`${PROXY}?url=${encodeURIComponent(target)}`, init);
}

function makeCtx() {
  const tasks = [];
  return { tasks, waitUntil(promise) { tasks.push(promise); } };
}

function makeCache() {
  const store = new Map();
  return {
    store,
    async match(request) {
      return store.get(request.url);
    },
    async put(request, response) {
      store.set(request.url, response);
    },
  };
}

const originalFetch = globalThis.fetch;
const originalConsoleLog = console.log;

function stubGlobals({ fetchImpl, cache = makeCache() } = {}) {
  globalThis.caches = { default: cache };
  globalThis.fetch = fetchImpl ?? (async () => new Response("ok", { status: 200 }));
  return cache;
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  console.log = originalConsoleLog;
  delete globalThis.caches;
});

test("answers CORS preflight", async () => {
  stubGlobals();
  const response = await worker.fetch(
    new Request(PROXY, { method: "OPTIONS" }),
    {},
    makeCtx()
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
});

test("rejects a missing url", async () => {
  stubGlobals();
  const response = await worker.fetch(new Request(PROXY), {}, makeCtx());
  assert.equal(response.status, 400);
});

test("rejects malformed and non-http urls", async () => {
  stubGlobals();
  const invalid = await worker.fetch(proxyRequest("not a url"), {}, makeCtx());
  assert.equal(invalid.status, 400);

  for (const target of ["file:///etc/passwd", "ftp://example.com/x"]) {
    const response = await worker.fetch(proxyRequest(target), {}, makeCtx());
    assert.equal(response.status, 403, `expected 403 for ${target}`);
  }
});

test("blocks SSRF targets", async () => {
  let called = false;
  stubGlobals({ fetchImpl: async () => { called = true; return new Response("x"); } });
  const targets = [
    "http://127.0.0.1/",
    "http://localhost/",
    "http://10.1.2.3/",
    "http://192.168.0.1/",
    "http://169.254.169.254/latest/meta-data/",
    "http://[::1]/",
    "http://[fd00::1]/",
    "https://foo.internal/",
  ];
  for (const target of targets) {
    const response = await worker.fetch(proxyRequest(target), {}, makeCtx());
    assert.equal(response.status, 403, `expected 403 for ${target}`);
  }
  assert.equal(called, false, "no SSRF target should reach fetch");
});

test("blocks a redirect to a private address", async () => {
  stubGlobals({
    fetchImpl: async () =>
      new Response(null, { status: 302, headers: { location: "http://127.0.0.1/secret" } }),
  });
  const response = await worker.fetch(proxyRequest("https://example.com/a"), {}, makeCtx());
  assert.equal(response.status, 502);
});

test("overrides no-cache on a 404 and edge-caches it", async () => {
  const cache = stubGlobals({
    fetchImpl: async () =>
      new Response("gone", {
        status: 404,
        headers: { "content-length": "4", "cache-control": "no-cache" },
      }),
  });
  const ctx = makeCtx();
  const response = await worker.fetch(proxyRequest("https://example.com/missing"), {}, ctx);
  assert.equal(response.status, 404);
  assert.equal(response.headers.get("cache-control"), "public, max-age=3600");
  await Promise.all(ctx.tasks);
  assert.equal(cache.store.size, 1, "404 should be edge-cached");
});

test("caches images as immutable", async () => {
  const cache = stubGlobals({
    fetchImpl: async () =>
      new Response("img", {
        status: 200,
        headers: { "content-type": "image/jpeg", "content-length": "3" },
      }),
  });
  const ctx = makeCtx();
  const response = await worker.fetch(proxyRequest("https://example.com/a.jpg"), {}, ctx);
  assert.equal(response.headers.get("cache-control"), "public, max-age=31536000, immutable");
  await Promise.all(ctx.tasks);
  assert.equal(cache.store.size, 1);
});

test("serves a cache hit without calling fetch", async () => {
  const cache = stubGlobals();
  cache.store.set(
    "https://example.com/hit.jpg",
    new Response("cached", { status: 200, headers: { "content-type": "image/jpeg" } })
  );
  let called = false;
  globalThis.fetch = async () => { called = true; return new Response("nope"); };

  const response = await worker.fetch(proxyRequest("https://example.com/hit.jpg"), {}, makeCtx());
  assert.equal(await response.text(), "cached");
  assert.equal(called, false);
});

test("refuses oversized responses", async () => {
  stubGlobals({
    fetchImpl: async () =>
      new Response("x", {
        status: 200,
        headers: { "content-length": String(25 * 1024 * 1024 + 1) },
      }),
  });
  const response = await worker.fetch(proxyRequest("https://example.com/big"), {}, makeCtx());
  assert.equal(response.status, 413);
});

test("never logs the full target url", async () => {
  const logged = [];
  console.log = (...args) => logged.push(args.join(" "));

  stubGlobals({
    fetchImpl: async () => { throw new Error("boom"); },
  });
  const secret = "https://example.com/image?apikey=SUPERSECRET";
  const ctx = makeCtx();
  await worker.fetch(proxyRequest(secret), {}, ctx);

  const joined = logged.join("\n");
  assert.ok(!joined.includes("SUPERSECRET"), "secret must not be logged");
  assert.ok(joined.includes("example.com"), "host should be logged for diagnosis");
});
