import test from "node:test";
import assert from "node:assert/strict";
import worker from "./worker.js";
import { handleRequest, parseTokens } from "./core.js";
import {
  BLOB_FIELDS,
  CACHE_OUTCOMES,
  CLIENT_CLASSES,
  FETCH_ERROR_KINDS,
  MIME_BUCKETS,
  toDataPoint,
} from "./stats-schema.js";

const PROXY = "https://proxy.test/";
const TOKEN = "11111111-2222-4333-8444-555555555555";
const OTHER_TOKEN = "99999999-8888-4777-8666-555555555555";

function urlRequest(rawUrl, init = {}) {
  return new Request(rawUrl, init);
}

function proxyRequest(target, init = {}) {
  return urlRequest(`${PROXY}?url=${encodeURIComponent(target)}`, init);
}

// A locked proxy request: token as a path segment, exactly what the app builds
// by prefixing `https://proxy.test/<token>/?url=`.
function pathTokenRequest(target, token = TOKEN, init = {}) {
  return urlRequest(`${PROXY}${token}/?url=${encodeURIComponent(target)}`, init);
}

// A locked proxy request: token as a query parameter before `url=`.
function queryTokenRequest(target, token = TOKEN, init = {}) {
  return urlRequest(`${PROXY}?token=${token}&url=${encodeURIComponent(target)}`, init);
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
  globalThis.fetch = fetchImpl ?? (async () => new Response("ok", { status: 200 }));
  globalThis.caches = { default: cache };
  return cache;
}

function callWorker(request, { env = {}, cache = makeCache(), ctx = makeCtx() } = {}) {
  globalThis.caches = { default: cache };
  return worker.fetch(request, env, { ...ctx, waitUntil: ctx.waitUntil.bind(ctx) });
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  delete globalThis.caches;
  console.log = originalConsoleLog;
});

// ---------------------------------------------------------------------------
// Token auth
// ---------------------------------------------------------------------------

test("answers CORS preflight without a token", async () => {
  const request = urlRequest(`${PROXY}?url=https%3A%2F%2Fexample.com%2F`, { method: "OPTIONS" });
  const response = await callWorker(request, { env: { PROXY_TOKENS: TOKEN } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
});

test("accepts a path-segment token and proxies", async () => {
  stubGlobals({
    fetchImpl: async () =>
      new Response("<html>ok</html>", {
        status: 200,
        headers: { "content-type": "text/html", "content-length": "15" },
      }),
  });
  const response = await callWorker(pathTokenRequest("https://example.com/a"), {
    env: { PROXY_TOKENS: TOKEN },
  });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "<html>ok</html>");
});

test("accepts a query-parameter token and proxies", async () => {
  stubGlobals({
    fetchImpl: async () =>
      new Response("ok", { status: 200, headers: { "content-type": "text/plain" } }),
  });
  const response = await callWorker(queryTokenRequest("https://example.com/a"), {
    env: { PROXY_TOKENS: TOKEN },
  });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "ok");
});

test("rejects a wrong token with 404", async () => {
  let called = false;
  stubGlobals({
    fetchImpl: async () => {
      called = true;
      return new Response("nope");
    },
  });
  for (const request of [
    pathTokenRequest("https://example.com/a", "wrong-token"),
    queryTokenRequest("https://example.com/a", "wrong-token"),
  ]) {
    const response = await callWorker(request, { env: { PROXY_TOKENS: TOKEN } });
    assert.equal(response.status, 404);
  }
  assert.equal(called, false, "unauthorized requests must not reach fetch");
});

test("rejects a missing token with 404", async () => {
  let called = false;
  stubGlobals({
    fetchImpl: async () => {
      called = true;
      return new Response("nope");
    },
  });
  const response = await callWorker(proxyRequest("https://example.com/a"), {
    env: { PROXY_TOKENS: TOKEN },
  });
  assert.equal(response.status, 404);
  assert.equal(called, false);
});

test("serves a cache hit only when the token is valid", async () => {
  const cache = stubGlobals();
  cache.store.set(
    "https://example.com/hit.jpg",
    new Response("cached", { status: 200, headers: { "content-type": "image/jpeg" } })
  );

  const denied = await callWorker(proxyRequest("https://example.com/hit.jpg"), {
    env: { PROXY_TOKENS: TOKEN },
    cache,
  });
  assert.equal(denied.status, 404, "auth is checked before the cache lookup");
  assert.notEqual(await denied.text(), "cached");

  const allowed = await callWorker(pathTokenRequest("https://example.com/hit.jpg"), {
    env: { PROXY_TOKENS: TOKEN },
    cache,
  });
  assert.equal(allowed.status, 200);
  assert.equal(await allowed.text(), "cached");
});

test("supports multiple tokens so a token can be rotated", async () => {
  stubGlobals({
    fetchImpl: async () => new Response("ok", { status: 200 }),
  });
  const env = { PROXY_TOKENS: `${TOKEN}, ${OTHER_TOKEN}` };
  for (const token of [TOKEN, OTHER_TOKEN]) {
    const response = await callWorker(pathTokenRequest("https://example.com/a", token), { env });
    assert.equal(response.status, 200, `token ${token} should work`);
  }
  const response = await callWorker(pathTokenRequest("https://example.com/a", "retired"), { env });
  assert.equal(response.status, 404, "a retired token must not work");
});

test("parseTokens trims and drops empty entries", () => {
  assert.deepEqual(parseTokens(" a , ,b,  "), ["a", "b"]);
  assert.deepEqual(parseTokens(""), []);
  assert.deepEqual(parseTokens(undefined), []);
});

// ---------------------------------------------------------------------------
// Open vs unconfigured
// ---------------------------------------------------------------------------

test("public mode proxies without a token", async () => {
  stubGlobals({
    fetchImpl: async () =>
      new Response("ok", { status: 200, headers: { "content-type": "text/plain" } }),
  });
  const response = await callWorker(proxyRequest("https://example.com/a"), {
    env: { PUBLIC: "true" },
  });
  assert.equal(response.status, 200);
});

test("unconfigured serves a setup page and never proxies", async () => {
  let called = false;
  stubGlobals({
    fetchImpl: async () => {
      called = true;
      return new Response("proxied");
    },
  });
  for (const request of [proxyRequest("https://example.com/a"), urlRequest(PROXY)]) {
    const response = await callWorker(request, { env: {} });
    assert.equal(response.status, 200);
    const body = await response.text();
    assert.match(body, /wrangler secret put PROXY_TOKENS/);
    // A fresh UUID, and the exact proxy string to paste into Savr.
    const uuid = body.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/)?.[0];
    assert.ok(uuid, "setup page should show a generated token");
    assert.ok(body.includes(`https://proxy.test/${uuid}/?url=`), "setup page should show the paste string");
    assert.equal(response.headers.get("content-type"), "text/html; charset=utf-8");
  }
  assert.equal(called, false, "an unconfigured proxy must never fetch");
});

test("unconfigured refuses to treat the deploy as open", async () => {
  stubGlobals();
  const response = await callWorker(urlRequest(`${PROXY}${TOKEN}/?url=https%3A%2F%2Fx.test%2F`), {
    env: { PROXY_TOKENS: "" },
  });
  assert.equal(response.status, 200);
  assert.match(await response.text(), /not configured/);
});

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

test("health needs a valid token when locked", async () => {
  const ok = await callWorker(urlRequest(`${PROXY}${TOKEN}/health`), {
    env: { PROXY_TOKENS: TOKEN },
  });
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), {
    name: "savr-cors-proxy",
    version: "1.0.0",
    authRequired: true,
  });

  const queryOk = await callWorker(urlRequest(`${PROXY}health?token=${TOKEN}`), {
    env: { PROXY_TOKENS: TOKEN },
  });
  assert.equal(queryOk.status, 200);

  const denied = await callWorker(urlRequest(`${PROXY}health`), {
    env: { PROXY_TOKENS: TOKEN },
  });
  assert.equal(denied.status, 404);

  const wrong = await callWorker(urlRequest(`${PROXY}${OTHER_TOKEN}/health`), {
    env: { PROXY_TOKENS: TOKEN },
  });
  assert.equal(wrong.status, 404);
});

test("health reports authRequired false on the public instance", async () => {
  const response = await callWorker(urlRequest(`${PROXY}health`), { env: { PUBLIC: "true" } });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    name: "savr-cors-proxy",
    version: "1.0.0",
    authRequired: false,
  });
});

// ---------------------------------------------------------------------------
// Proxy behaviour (unchanged hardening)
// ---------------------------------------------------------------------------

test("rejects a missing url", async () => {
  stubGlobals();
  const response = await callWorker(urlRequest(PROXY), { env: { PUBLIC: "true" } });
  assert.equal(response.status, 400);
});

test("rejects malformed and non-http urls", async () => {
  stubGlobals();
  const invalid = await callWorker(proxyRequest("not a url"), { env: { PUBLIC: "true" } });
  assert.equal(invalid.status, 400);

  for (const target of ["file:///etc/passwd", "ftp://example.com/x"]) {
    const response = await callWorker(proxyRequest(target), { env: { PUBLIC: "true" } });
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
    const response = await callWorker(proxyRequest(target), { env: { PUBLIC: "true" } });
    assert.equal(response.status, 403, `expected 403 for ${target}`);
  }
  assert.equal(called, false, "no SSRF target should reach fetch");
});

test("blocks a redirect to a private address", async () => {
  stubGlobals({
    fetchImpl: async () =>
      new Response(null, { status: 302, headers: { location: "http://127.0.0.1/secret" } }),
  });
  const response = await callWorker(proxyRequest("https://example.com/a"), {
    env: { PUBLIC: "true" },
  });
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
  const request = urlRequest(`${PROXY}${TOKEN}/?url=https%3A%2F%2Fexample.com%2Fmissing`);
  const response = await handleRequest(request, {
    tokens: [TOKEN],
    isPublic: false,
    cache,
    waitUntil: ctx.waitUntil.bind(ctx),
  });
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
  const request = urlRequest(`${PROXY}${TOKEN}/?url=https%3A%2F%2Fexample.com%2Fa.jpg`);
  const response = await handleRequest(request, {
    tokens: [TOKEN],
    isPublic: false,
    cache,
    waitUntil: ctx.waitUntil.bind(ctx),
  });
  assert.equal(response.headers.get("cache-control"), "public, max-age=31536000, immutable");
  await Promise.all(ctx.tasks);
  assert.equal(cache.store.size, 1);
});

test("refuses oversized responses", async () => {
  stubGlobals({
    fetchImpl: async () =>
      new Response("x", {
        status: 200,
        headers: { "content-length": String(25 * 1024 * 1024 + 1) },
      }),
  });
  const response = await callWorker(proxyRequest("https://example.com/big"), {
    env: { PUBLIC: "true" },
  });
  assert.equal(response.status, 413);
});

test("never logs the full target url", async () => {
  const logged = [];
  console.log = (...args) => logged.push(args.join(" "));

  stubGlobals({
    fetchImpl: async () => { throw new Error("boom"); },
  });
  const secret = "https://example.com/image?apikey=SUPERSECRET";
  await callWorker(proxyRequest(secret), { env: { PUBLIC: "true" } });

  const joined = logged.join("\n");
  assert.ok(!joined.includes("SUPERSECRET"), "secret must not be logged");
  assert.ok(joined.includes("example.com"), "host should be logged for diagnosis");
});

// ---------------------------------------------------------------------------
// Usage statistics (Analytics Engine)
// ---------------------------------------------------------------------------

function makeStatsEnv() {
  const points = [];
  return {
    points,
    env: {
      PUBLIC: "true",
      STATS: {
        writeDataPoint(point) {
          points.push(point);
        },
      },
    },
  };
}

function withCountry(request, country) {
  Object.defineProperty(request, "cf", { value: { country } });
  return request;
}

test("records an aggregate stat for a proxied article html fetch", async () => {
  stubGlobals({
    fetchImpl: async () =>
      new Response("<html>", {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8", "content-length": "6" },
      }),
  });
  const { points, env } = makeStatsEnv();
  const request = withCountry(proxyRequest("https://example.com/article"), "NZ");
  const response = await callWorker(request, { env });

  assert.equal(response.status, 200);
  assert.equal(points.length, 1);
  const [point] = points;
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
  const { points, env } = makeStatsEnv();

  const webApp = proxyRequest("https://example.com/a");
  webApp.headers.set("origin", "https://savr.link");
  webApp.headers.set("user-agent", "Mozilla/5.0 (X11; Linux x86_64) Gecko/20100101 Firefox/136.0");
  await callWorker(webApp, { env });

  const extension = proxyRequest("https://example.com/b");
  extension.headers.set("origin", "chrome-extension://abcdefghijklmnop");
  extension.headers.set("user-agent", "Mozilla/5.0 Chrome/130.0.0.0");
  await callWorker(extension, { env });

  const script = proxyRequest("https://example.com/c");
  script.headers.set("user-agent", "curl/8.5.0");
  await callWorker(script, { env });

  assert.deepEqual(
    points.map((point) => [point.blobs[5], point.blobs[6]]),
    [
      ["savr.link", "browser"],
      ["chrome-extension", "browser"],
      ["", "bot"],
    ]
  );
  assert.ok(
    points.every((point) => point.blobs.every((blob) => !blob.includes("Mozilla") && !blob.includes("abcdefghijklmnop"))),
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
  const { points, env } = makeStatsEnv();
  await callWorker(withCountry(proxyRequest("https://example.com/hit.jpg"), "DE"), { env, cache });

  assert.equal(points.length, 1);
  const [point] = points;
  assert.equal(point.blobs[1], "image");
  assert.equal(point.blobs[3], "hit");
  assert.equal(point.blobs[4], "");
  assert.equal(point.doubles[2], 6, "cached size");
});

test("records the host only on failures", async () => {
  stubGlobals({
    fetchImpl: async () => new Response("gone", { status: 404 }),
  });
  const { points, env } = makeStatsEnv();
  const response = await callWorker(
    withCountry(proxyRequest("https://example.com/missing"), "US"),
    { env }
  );

  assert.equal(response.status, 404);
  assert.equal(points.length, 1);
  const [point] = points;
  assert.equal(point.blobs[2], "404");
  assert.equal(point.blobs[4], "example.com", "failing host recorded");
});

test("does not record preflights, health checks, or requests without a url", async () => {
  stubGlobals();
  const { points, env } = makeStatsEnv();

  await callWorker(urlRequest(`${PROXY}?url=https%3A%2F%2Fexample.com%2F`, { method: "OPTIONS" }), { env });
  await callWorker(urlRequest(`${PROXY}health`), { env });
  await callWorker(urlRequest(PROXY), { env });
  await callWorker(proxyRequest("http://127.0.0.1/"), { env });

  assert.equal(points.length, 2, "only the missing-url and blocked-target errors");
  assert.deepEqual(
    points.map((point) => point.blobs[2]),
    ["400", "403"]
  );
  assert.equal(points[1].blobs[3], "bypass", "no cache consult");
  assert.equal(points[1].blobs[4], "127.0.0.1", "blocked target host is diagnostic");
});

test("records blocked and failed upstreams with fallback country", async () => {
  stubGlobals({
    fetchImpl: async () => { throw new Error("boom"); },
  });
  const { points, env } = makeStatsEnv();
  await callWorker(proxyRequest("https://example.com/x"), { env });

  assert.equal(points.length, 1);
  assert.equal(points[0].blobs[0], "XX", "no cf.country -> XX");
  assert.equal(points[0].blobs[2], "502");
  assert.equal(points[0].blobs[3], "miss", "cache was consulted before the failure");
  assert.equal(points[0].blobs[4], "example.com");
  assert.equal(points[0].blobs[7], "other", "unclassified fetch error");
  assert.equal(points[0].doubles[2], -1, "unknown size");
});

test("classifies redirect failures for the 502 breakdown", async () => {
  stubGlobals({
    fetchImpl: async () =>
      new Response(null, { status: 302, headers: { location: "http://127.0.0.1/secret" } }),
  });
  const { points, env } = makeStatsEnv();
  await callWorker(proxyRequest("https://example.com/redirect"), { env });

  assert.equal(points[0].blobs[2], "502");
  assert.equal(points[0].blobs[7], "blocked-redirect");
});

test("a failing stats write never costs the proxied response", async () => {
  stubGlobals();
  const logged = [];
  console.log = (...args) => logged.push(args.join(" "));
  try {
    const env = {
      PUBLIC: "true",
      STATS: {
        writeDataPoint() {
          throw new Error("AE unavailable");
        },
      },
    };
    const response = await callWorker(proxyRequest("https://example.com/a"), { env });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "ok");
    assert.ok(logged.some((line) => line.includes("stats write failed")));
  } finally {
    console.log = originalConsoleLog;
  }
});

test("buckets dev and LAN caller origins as local", async () => {
  stubGlobals();
  const { points, env } = makeStatsEnv();
  for (const origin of [
    "http://localhost:5173",
    "http://192.168.1.20:3000",
    "http://[::1]:5173",
    "http://nas.local",
    "https://reader.example.org",
  ]) {
    const request = proxyRequest("https://example.com/a");
    request.headers.set("origin", origin);
    await callWorker(request, { env });
  }
  assert.deepEqual(
    points.map((point) => point.blobs[BLOB_FIELDS.indexOf("origin")]),
    ["local", "local", "local", "local", "reader.example.org"]
  );
});

test("only emits values from the shared stats vocabularies", async () => {
  const types = [
    "text/html", "application/xhtml+xml", "image/webp", "video/mp4", "audio/ogg",
    "font/woff2", "application/font-woff", "text/css", "application/javascript",
    "application/pdf", "application/ld+json", "application/rss+xml", "text/plain",
    "application/octet-stream", "",
  ];
  const { points, env } = makeStatsEnv();
  for (const type of types) {
    stubGlobals({
      fetchImpl: async () =>
        new Response(new Uint8Array([1]), { status: 200, headers: type ? { "content-type": type } : {} }),
    });
    const request = proxyRequest(`https://example.com/${encodeURIComponent(type)}`);
    request.headers.set("user-agent", type ? "Mozilla/5.0" : "curl/8");
    await callWorker(request, { env });
  }
  for (const message of ["blocked redirect target", "too many redirects", "timed out", "dns lookup failed", "boom"]) {
    stubGlobals({ fetchImpl: async () => { throw new Error(message); } });
    console.log = () => {};
    try {
      await callWorker(proxyRequest("https://example.com/fail"), { env });
    } finally {
      console.log = originalConsoleLog;
    }
  }
  const field = (name) => points.map((point) => point.blobs[BLOB_FIELDS.indexOf(name)]);
  const emitted = (name) => new Set(field(name).filter(Boolean));

  assert.deepEqual([...emitted("mime")].sort(), [...MIME_BUCKETS].sort(), "every bucket reachable, none extra");
  for (const value of emitted("cache")) assert.ok(CACHE_OUTCOMES.includes(value), value);
  for (const value of emitted("client")) assert.ok(CLIENT_CLASSES.includes(value), value);
  assert.deepEqual([...emitted("errorKind")].sort(), [...FETCH_ERROR_KINDS].sort());
});

test("toDataPoint lays fields out in schema order", () => {
  const point = toDataPoint(
    {
      status: 404, mime: "html", cache: "miss", host: "example.com", origin: "savr.link",
      client: "browser", errorKind: "", durationMs: 12, bytes: 34,
    },
    "NZ"
  );
  assert.deepEqual(point.blobs, ["NZ", "html", "404", "miss", "example.com", "savr.link", "browser", ""]);
  assert.deepEqual(point.doubles, [1, 12, 34]);
  assert.equal(toDataPoint({ status: 200 }, undefined).blobs[0], "XX");
});

test("deploys without the stats binding still proxy", async () => {
  stubGlobals({
    fetchImpl: async () => new Response("ok", { status: 200 }),
  });
  const response = await callWorker(proxyRequest("https://example.com/a"), {
    env: { PUBLIC: "true" },
  });
  assert.equal(response.status, 200, "a self-hosted deploy must not require Analytics Engine");
});
