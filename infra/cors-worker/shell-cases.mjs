/**
 * The proxy behaviour every runtime shell must share: token auth, setup page,
 * health, SSRF refusals, size cap, log hygiene and the origin allowlist.
 * `worker.test.mjs` runs it against the Cloudflare shell and `node.test.mjs`
 * against the Node shell; each passes a `callShell(request, { env, cache })`.
 * Not itself a test file (no `.test.` in the name), so it runs only through them.
 */
import test from "node:test";
import assert from "node:assert/strict";

export const PROXY = "https://proxy.test/";
export const TOKEN = "11111111-2222-4333-8444-555555555555";
export const OTHER_TOKEN = "99999999-8888-4777-8666-555555555555";

export function urlRequest(rawUrl, init = {}) {
  return new Request(rawUrl, init);
}

export function proxyRequest(target, init = {}) {
  return urlRequest(`${PROXY}?url=${encodeURIComponent(target)}`, init);
}

// A locked proxy request: token as a path segment, exactly what the app builds
// by prefixing `https://proxy.test/<token>/?url=`.
export function pathTokenRequest(target, token = TOKEN, init = {}) {
  return urlRequest(`${PROXY}${token}/?url=${encodeURIComponent(target)}`, init);
}

// A locked proxy request: token as a query parameter before `url=`.
export function queryTokenRequest(target, token = TOKEN, init = {}) {
  return urlRequest(`${PROXY}?token=${token}&url=${encodeURIComponent(target)}`, init);
}

export function makeCtx() {
  const tasks = [];
  return { tasks, waitUntil(promise) { tasks.push(promise); } };
}

export function makeCache() {
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

export function stubGlobals({ fetchImpl, cache = makeCache() } = {}) {
  globalThis.fetch = fetchImpl ?? (async () => new Response("ok", { status: 200 }));
  globalThis.caches = { default: cache };
  return cache;
}

/** Undo `stubGlobals` and any captured console.log; register with test.afterEach. */
export function restoreGlobals() {
  globalThis.fetch = originalFetch;
  delete globalThis.caches;
  console.log = originalConsoleLog;
}

export const PUBLIC_ALLOWED_ORIGINS =
  "https://savr.link,https://*--savrlist.netlify.app,http://localhost:*,http://127.0.0.1:*";

export function fromOrigin(origin, target = "https://example.com/a") {
  return proxyRequest(target, origin ? { headers: { origin } } : {});
}

export function countingFetch() {
  const calls = [];
  stubGlobals({
    fetchImpl: async (url) => {
      calls.push(String(url));
      return new Response("<html>ok</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    },
  });
  return calls;
}

export function defineShellSuite(callShell) {
  // ---------------------------------------------------------------------------
  // Token auth
  // ---------------------------------------------------------------------------

  test("answers CORS preflight without a token", async () => {
    const request = urlRequest(`${PROXY}?url=https%3A%2F%2Fexample.com%2F`, { method: "OPTIONS" });
    const response = await callShell(request, { env: { PROXY_TOKENS: TOKEN } });
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
    const response = await callShell(pathTokenRequest("https://example.com/a"), {
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
    const response = await callShell(queryTokenRequest("https://example.com/a"), {
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
      const response = await callShell(request, { env: { PROXY_TOKENS: TOKEN } });
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
    const response = await callShell(proxyRequest("https://example.com/a"), {
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

    const denied = await callShell(proxyRequest("https://example.com/hit.jpg"), {
      env: { PROXY_TOKENS: TOKEN },
      cache,
    });
    assert.equal(denied.status, 404, "auth is checked before the cache lookup");
    assert.notEqual(await denied.text(), "cached");

    const allowed = await callShell(pathTokenRequest("https://example.com/hit.jpg"), {
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
      const response = await callShell(pathTokenRequest("https://example.com/a", token), { env });
      assert.equal(response.status, 200, `token ${token} should work`);
    }
    const response = await callShell(pathTokenRequest("https://example.com/a", "retired"), { env });
    assert.equal(response.status, 404, "a retired token must not work");
  });


  // ---------------------------------------------------------------------------
  // Open vs unconfigured
  // ---------------------------------------------------------------------------

  test("public mode proxies without a token", async () => {
    stubGlobals({
      fetchImpl: async () =>
        new Response("ok", { status: 200, headers: { "content-type": "text/plain" } }),
    });
    const response = await callShell(proxyRequest("https://example.com/a"), {
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
      const response = await callShell(request, { env: {} });
      assert.equal(response.status, 200);
      const body = await response.text();
      assert.match(body, /PROXY_TOKENS/);
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
    const response = await callShell(urlRequest(`${PROXY}${TOKEN}/?url=https%3A%2F%2Fx.test%2F`), {
      env: { PROXY_TOKENS: "" },
    });
    assert.equal(response.status, 200);
    assert.match(await response.text(), /not configured/);
  });

  // ---------------------------------------------------------------------------
  // Health
  // ---------------------------------------------------------------------------

  test("health needs a valid token when locked", async () => {
    const ok = await callShell(urlRequest(`${PROXY}${TOKEN}/health`), {
      env: { PROXY_TOKENS: TOKEN },
    });
    assert.equal(ok.status, 200);
    assert.deepEqual(await ok.json(), {
      name: "savr-cors-proxy",
      version: "1.0.0",
      authRequired: true,
    });

    const queryOk = await callShell(urlRequest(`${PROXY}health?token=${TOKEN}`), {
      env: { PROXY_TOKENS: TOKEN },
    });
    assert.equal(queryOk.status, 200);

    const denied = await callShell(urlRequest(`${PROXY}health`), {
      env: { PROXY_TOKENS: TOKEN },
    });
    assert.equal(denied.status, 404);

    const wrong = await callShell(urlRequest(`${PROXY}${OTHER_TOKEN}/health`), {
      env: { PROXY_TOKENS: TOKEN },
    });
    assert.equal(wrong.status, 404);
  });

  test("health reports authRequired false on the public instance", async () => {
    const response = await callShell(urlRequest(`${PROXY}health`), { env: { PUBLIC: "true" } });
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
    const response = await callShell(urlRequest(PROXY), { env: { PUBLIC: "true" } });
    assert.equal(response.status, 400);
  });

  // The app's proxy-health probe (#86) fetches the configured prefix with an
  // empty target and reads "answered with CORS headers" as "our code is
  // running". Every shape of prefix must get that CORS 400.
  test("answers the empty-target health probe with a CORS 400", async () => {
    stubGlobals();
    const cases = [
      [`${PROXY}?url=`, { PUBLIC: "true" }],
      [`${PROXY}${TOKEN}/?url=`, { PROXY_TOKENS: TOKEN }],
      [`${PROXY}?token=${TOKEN}&url=`, { PROXY_TOKENS: TOKEN }],
    ];
    for (const [prefix, env] of cases) {
      const response = await callShell(urlRequest(prefix), { env });
      assert.equal(response.status, 400, prefix);
      assert.equal(response.headers.get("access-control-allow-origin"), "*", prefix);
    }
  });

  // Behind an origin allowlist the probe still reads as "running": an allowed
  // caller gets the CORS 400, and a refused one a 404 that still carries CORS
  // headers — never an answer the app would mistake for a capped proxy.
  test("answers the health probe with CORS headers behind an origin allowlist", async () => {
    stubGlobals();
    const env = { PUBLIC: "true", ALLOWED_ORIGINS: "https://savr.link" };

    const allowed = await callShell(
      urlRequest(`${PROXY}?url=`, { headers: { Origin: "https://savr.link" } }),
      { env }
    );
    assert.equal(allowed.status, 400);
    assert.ok(allowed.headers.get("access-control-allow-origin"));

    const refused = await callShell(
      urlRequest(`${PROXY}?url=`, { headers: { Origin: "https://elsewhere.example" } }),
      { env }
    );
    assert.equal(refused.status, 404);
    assert.ok(refused.headers.get("access-control-allow-origin"));
  });

  test("rejects malformed and non-http urls", async () => {
    stubGlobals();
    const invalid = await callShell(proxyRequest("not a url"), { env: { PUBLIC: "true" } });
    assert.equal(invalid.status, 400);

    for (const target of ["file:///etc/passwd", "ftp://example.com/x"]) {
      const response = await callShell(proxyRequest(target), { env: { PUBLIC: "true" } });
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
      const response = await callShell(proxyRequest(target), { env: { PUBLIC: "true" } });
      assert.equal(response.status, 403, `expected 403 for ${target}`);
    }
    assert.equal(called, false, "no SSRF target should reach fetch");
  });

  test("blocks a redirect to a private address", async () => {
    stubGlobals({
      fetchImpl: async () =>
        new Response(null, { status: 302, headers: { location: "http://127.0.0.1/secret" } }),
    });
    const response = await callShell(proxyRequest("https://example.com/a"), {
      env: { PUBLIC: "true" },
    });
    assert.equal(response.status, 502);
  });

  test("refuses oversized responses", async () => {
    stubGlobals({
      fetchImpl: async () =>
        new Response("x", {
          status: 200,
          headers: { "content-length": String(25 * 1024 * 1024 + 1) },
        }),
    });
    const response = await callShell(proxyRequest("https://example.com/big"), {
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
    await callShell(proxyRequest(secret), { env: { PUBLIC: "true" } });

    const joined = logged.join("\n");
    assert.ok(!joined.includes("SUPERSECRET"), "secret must not be logged");
    assert.ok(joined.includes("example.com"), "host should be logged for diagnosis");
  });

  // ---------------------------------------------------------------------------
  // Origin allowlist
  // ---------------------------------------------------------------------------

  test("origin allowlist admits the listed sites, previews and local dev", async () => {
    countingFetch();
    const env = { PUBLIC: "true", ALLOWED_ORIGINS: PUBLIC_ALLOWED_ORIGINS };
    for (const origin of [
      "https://savr.link",
      "https://deploy-preview-116--savrlist.netlify.app",
      "https://feature-x--savrlist.netlify.app",
      "http://localhost:3000",
      "http://localhost",
      "http://127.0.0.1:8000",
    ]) {
      const response = await callShell(fromOrigin(origin), { env });
      assert.equal(response.status, 200, `${origin} should be allowed`);
      assert.equal(response.headers.get("access-control-allow-origin"), origin);
      assert.equal(response.headers.get("vary"), "Origin");
    }
  });

  test("origin allowlist refuses other callers with 404 and never fetches", async () => {
    const calls = countingFetch();
    const env = { PUBLIC: "true", ALLOWED_ORIGINS: PUBLIC_ALLOWED_ORIGINS };
    for (const origin of [
      undefined, // curl, server-side scripts, <img> hotlinks
      "null", // sandboxed iframes, file://
      "https://evil.example",
      "http://savr.link", // wrong scheme
      "https://savr.link.evil.example",
      "https://evilsavr.link",
      "https://savr.link:8443", // non-default port not listed
      "https://savrlist.netlify.app", // the bare site isn't a preview
      "https://evil.x--savrlist.netlify.app", // `*` never spans a dot
      "https://x--savrlist.netlify.app.evil.example",
      "https://localhost:3000", // wrong scheme
      "chrome-extension://abcdefghijklmnop",
    ]) {
      const response = await callShell(fromOrigin(origin), { env });
      assert.equal(response.status, 404, `${origin} should be refused`);
    }
    assert.deepEqual(calls, [], "refused callers must not reach fetch");
  });

  test("origin allowlist restricts callers, never targets", async () => {
    const calls = countingFetch();
    const env = { PUBLIC: "true", ALLOWED_ORIGINS: "https://savr.link" };
    for (const target of [
      "https://some-blog.example/post",
      "https://news.example.org/2026/article?x=1",
      "http://plain-http.example/",
    ]) {
      const response = await callShell(fromOrigin("https://savr.link", target), { env });
      assert.equal(response.status, 200, `${target} should be fetchable`);
    }
    assert.equal(calls.length, 3);
  });

  test("origin allowlist is checked before the edge cache", async () => {
    const cache = stubGlobals();
    cache.store.set(
      "https://example.com/hit.jpg",
      new Response("cached", { status: 200, headers: { "content-type": "image/jpeg" } })
    );
    const env = { PUBLIC: "true", ALLOWED_ORIGINS: "https://savr.link" };

    const denied = await callShell(fromOrigin("https://evil.example", "https://example.com/hit.jpg"), { env, cache });
    assert.equal(denied.status, 404);

    const allowed = await callShell(fromOrigin("https://savr.link", "https://example.com/hit.jpg"), { env, cache });
    assert.equal(allowed.status, 200);
    assert.equal(await allowed.text(), "cached");
    assert.ok(allowed.headers.get("access-control-allow-origin"));
  });

  test("origin allowlist leaves preflight and health open", async () => {
    stubGlobals();
    const env = { PUBLIC: "true", ALLOWED_ORIGINS: "https://savr.link" };
    const preflight = await callShell(
      urlRequest(`${PROXY}?url=https%3A%2F%2Fexample.com%2F`, { method: "OPTIONS" }),
      { env }
    );
    assert.equal(preflight.status, 200);
    const health = await callShell(urlRequest(`${PROXY}health`), { env });
    assert.equal(health.status, 200);
  });

  test("origin allowlist composes with a token", async () => {
    countingFetch();
    const env = { PROXY_TOKENS: TOKEN, ALLOWED_ORIGINS: "https://savr.link" };
    const ok = await callShell(
      pathTokenRequest("https://example.com/a", TOKEN, { headers: { origin: "https://savr.link" } }),
      { env }
    );
    assert.equal(ok.status, 200);
    const noToken = await callShell(fromOrigin("https://savr.link"), { env });
    assert.equal(noToken.status, 404, "the allowlist does not replace the token");
    const wrongOrigin = await callShell(
      pathTokenRequest("https://example.com/a", TOKEN, { headers: { origin: "https://evil.example" } }),
      { env }
    );
    assert.equal(wrongOrigin.status, 404, "the token does not bypass the allowlist");
  });

  test("without ALLOWED_ORIGINS any caller may proxy, with a wildcard CORS header", async () => {
    countingFetch();
    for (const origin of [undefined, "https://my-self-hosted-savr.example"]) {
      const response = await callShell(fromOrigin(origin), { env: { PUBLIC: "true" } });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("access-control-allow-origin"), "*");
    }
  });
}
