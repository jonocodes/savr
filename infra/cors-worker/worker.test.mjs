import test from "node:test";
import assert from "node:assert/strict";
import worker from "./worker.js";
import { handleRequest, parseOriginPatterns, parsePublic, parseTokens, proxyMode } from "./core.js";
import {
  BLOB_FIELDS,
  CACHE_OUTCOMES,
  CLIENT_CLASSES,
  FETCH_ERROR_KINDS,
  MIME_BUCKETS,
  toDataPoint,
} from "./stats-schema.js";
import {
  TOKEN,
  PROXY,
  countingFetch,
  defineShellSuite,
  fromOrigin,
  makeCache,
  makeCtx,
  proxyRequest,
  restoreGlobals,
  stubGlobals,
  urlRequest,
} from "./shell-cases.mjs";

function callWorker(request, { env = {}, cache = makeCache(), ctx = makeCtx() } = {}) {
  globalThis.caches = { default: cache };
  return worker.fetch(request, env, { ...ctx, waitUntil: ctx.waitUntil.bind(ctx) });
}

const originalConsoleLog = console.log;

test.afterEach(restoreGlobals);

test.describe("cloudflare shell", () => defineShellSuite(callWorker));

test("the Cloudflare setup page gives the wrangler command", async () => {
  stubGlobals();
  const response = await callWorker(urlRequest(PROXY), { env: {} });
  assert.match(await response.text(), /npx wrangler secret put PROXY_TOKENS/);
});

test("parsePublic accepts only 'true', case-insensitively", () => {
  for (const raw of ["true", "TRUE", "True"]) assert.equal(parsePublic(raw), true, raw);
  // Anything else fails closed (ADR 0002), stray whitespace included.
  for (const raw of [undefined, "", "false", "1", "yes", "truthy", " true "]) assert.equal(parsePublic(raw), false, String(raw));
});

test("proxyMode: PUBLIC wins over tokens; neither means unconfigured", () => {
  assert.equal(proxyMode({ tokens: [], isPublic: true }), "public");
  assert.equal(proxyMode({ tokens: ["a"], isPublic: true }), "public");
  assert.equal(proxyMode({ tokens: ["a"], isPublic: false }), "locked");
  assert.equal(proxyMode({ tokens: [], isPublic: false }), "unconfigured");
});

test("parseTokens trims and drops empty entries", () => {
  assert.deepEqual(parseTokens(" a , ,b,  "), ["a", "b"]);
  assert.deepEqual(parseTokens(""), []);
  assert.deepEqual(parseTokens(undefined), []);
});

// ---------------------------------------------------------------------------
// Core caching (handleRequest directly)
// ---------------------------------------------------------------------------

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

test("classifies Cloudflare's 530 origin-DNS page as a dns failure, passing it through", async () => {
  const errorKind = BLOB_FIELDS.indexOf("errorKind");
  const { points, env } = makeStatsEnv();
  for (const body of ["error code: 1016", "error code: 1033"]) {
    stubGlobals({
      fetchImpl: async () =>
        new Response(body, {
          status: 530,
          headers: { "content-type": "text/plain; charset=UTF-8", "content-length": String(body.length) },
        }),
    });
    const response = await callWorker(proxyRequest("https://no-such-host.example/"), { env });
    assert.equal(response.status, 530, "status passes through unchanged");
    assert.equal(await response.text(), body, "body still readable by the client");
  }
  assert.deepEqual(
    points.map((point) => [point.blobs[2], point.blobs[4], point.blobs[errorKind]]),
    [
      ["530", "no-such-host.example", "dns"],
      ["530", "no-such-host.example", "other"],
    ]
  );
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

test("records refused origins so the dashboard shows who was turned away", async () => {
  countingFetch();
  const { points, env } = makeStatsEnv();
  env.ALLOWED_ORIGINS = "https://savr.link";
  await callWorker(fromOrigin("https://evil.example"), { env });
  assert.equal(points.length, 1);
  const [point] = points;
  assert.equal(point.blobs[BLOB_FIELDS.indexOf("status")], "404");
  assert.equal(point.blobs[BLOB_FIELDS.indexOf("cache")], "bypass");
  assert.equal(point.blobs[BLOB_FIELDS.indexOf("origin")], "evil.example");
});

test("parseOriginPatterns drops malformed entries and tolerates spacing and case", () => {
  assert.deepEqual(parseOriginPatterns(""), []);
  assert.deepEqual(parseOriginPatterns(undefined), []);
  assert.equal(
    parseOriginPatterns(" https://Savr.link/ , savr.link, ftp://x.example, https://a.example/path ").length,
    1,
    "only the well-formed origin survives"
  );
});
