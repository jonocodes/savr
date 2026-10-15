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

function makeEnv() {
  const points = [];
  return {
    points,
    STATS: {
      writeDataPoint(point) {
        points.push(point);
      },
    },
  };
}

function withCountry(request, country) {
  Object.defineProperty(request, "cf", { value: { country } });
  return request;
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

test("records an aggregate stat for a proxied article html fetch", async () => {
  stubGlobals({
    fetchImpl: async () =>
      new Response("<html>", {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8", "content-length": "6" },
      }),
  });
  const env = makeEnv();
  const request = withCountry(proxyRequest("https://example.com/article"), "NZ");
  const response = await worker.fetch(request, env, makeCtx());

  assert.equal(response.status, 200);
  assert.equal(env.points.length, 1);
  const [point] = env.points;
  assert.deepEqual(point.indexes, ["proxy"]);
  assert.equal(point.blobs[0], "NZ", "country");
  assert.equal(point.blobs[1], "html", "MIME class");
  assert.equal(point.blobs[2], "200", "status");
  assert.equal(point.blobs[3], "miss", "cache");
  assert.equal(point.blobs[4], "", "no host on success");
  assert.equal(point.blobs[5], "", "no origin header");
  assert.equal(point.blobs[6], "none", "no user agent");
  assert.equal(point.blobs[7], "", "no error kind on success");
  assert.equal(point.doubles[0], 1);
  assert.ok(point.doubles[1] >= 0, "duration in ms");
  assert.equal(point.doubles[2], 6, "advertised bytes");
});

test("records caller origin and client class without storing the raw UA", async () => {
  stubGlobals();
  const env = makeEnv();

  const webApp = proxyRequest("https://example.com/a");
  webApp.headers.set("origin", "https://savr.link");
  webApp.headers.set("user-agent", "Mozilla/5.0 (X11; Linux x86_64) Gecko/20100101 Firefox/136.0");
  await worker.fetch(webApp, env, makeCtx());

  const extension = proxyRequest("https://example.com/b");
  extension.headers.set("origin", "chrome-extension://abcdefghijklmnop");
  extension.headers.set("user-agent", "Mozilla/5.0 Chrome/130.0.0.0");
  await worker.fetch(extension, env, makeCtx());

  const script = proxyRequest("https://example.com/c");
  script.headers.set("user-agent", "curl/8.5.0");
  await worker.fetch(script, env, makeCtx());

  assert.deepEqual(
    env.points.map((point) => [point.blobs[5], point.blobs[6]]),
    [
      ["savr.link", "browser"],
      ["chrome-extension", "browser"],
      ["", "bot"],
    ]
  );
  assert.ok(
    env.points.every((point) => point.blobs.every((blob) => !blob.includes("Mozilla") && !blob.includes("abcdefghijklmnop"))),
    "raw UA and extension id must never be stored"
  );
});

test("records a cache hit separately, with no upstream fetch", async () => {
  const cache = stubGlobals();
  cache.store.set(
    "https://example.com/hit.jpg",
    new Response("cached", {
      status: 200,
      headers: { "content-type": "image/jpeg", "content-length": "6" },
    })
  );
  const env = makeEnv();
  await worker.fetch(withCountry(proxyRequest("https://example.com/hit.jpg"), "DE"), env, makeCtx());

  assert.equal(env.points.length, 1);
  const [point] = env.points;
  assert.equal(point.blobs[1], "image");
  assert.equal(point.blobs[3], "hit");
  assert.equal(point.blobs[4], "");
  assert.equal(point.doubles[2], 6, "cached size");
});

test("records the host only on failures", async () => {
  stubGlobals({
    fetchImpl: async () => new Response("gone", { status: 404 }),
  });
  const env = makeEnv();
  const response = await worker.fetch(
    withCountry(proxyRequest("https://example.com/missing"), "US"),
    env,
    makeCtx()
  );

  assert.equal(response.status, 404);
  assert.equal(env.points.length, 1);
  const [point] = env.points;
  assert.equal(point.blobs[2], "404");
  assert.equal(point.blobs[4], "example.com", "failing host recorded");
});

test("does not record preflights or requests without a url", async () => {
  stubGlobals();
  const env = makeEnv();

  await worker.fetch(new Request(PROXY, { method: "OPTIONS" }), env, makeCtx());
  await worker.fetch(new Request(PROXY), env, makeCtx());
  await worker.fetch(proxyRequest("http://127.0.0.1/"), env, makeCtx());

  assert.equal(env.points.length, 2, "only the missing-url and blocked-target errors");
  assert.deepEqual(
    env.points.map((point) => point.blobs[2]),
    ["400", "403"]
  );
  assert.equal(env.points[1].blobs[3], "bypass", "no cache consult");
  assert.equal(env.points[1].blobs[4], "127.0.0.1", "blocked target host is diagnostic");
});

test("records blocked and failed upstreams with fallback country", async () => {
  stubGlobals({
    fetchImpl: async () => { throw new Error("boom"); },
  });
  const env = makeEnv();
  await worker.fetch(proxyRequest("https://example.com/x"), env, makeCtx());

  assert.equal(env.points.length, 1);
  assert.equal(env.points[0].blobs[0], "XX", "no cf.country -> XX");
  assert.equal(env.points[0].blobs[2], "502");
  assert.equal(env.points[0].blobs[3], "miss", "cache was consulted before the failure");
  assert.equal(env.points[0].blobs[4], "example.com");
  assert.equal(env.points[0].blobs[7], "other", "unclassified fetch error");
  assert.equal(env.points[0].doubles[2], -1, "unknown size");
});

test("classifies redirect failures for the 502 breakdown", async () => {
  stubGlobals({
    fetchImpl: async () =>
      new Response(null, { status: 302, headers: { location: "http://127.0.0.1/secret" } }),
  });
  const env = makeEnv();
  await worker.fetch(proxyRequest("https://example.com/redirect"), env, makeCtx());

  assert.equal(env.points[0].blobs[2], "502");
  assert.equal(env.points[0].blobs[7], "blocked-redirect");
});
