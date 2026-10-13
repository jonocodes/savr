import test from "node:test";
import assert from "node:assert/strict";
import worker from "./worker.js";
import { handleRequest, parseTokens } from "./core.js";

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
