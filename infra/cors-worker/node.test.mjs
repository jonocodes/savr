import test from "node:test";
import assert from "node:assert/strict";
import { createHandler, createServer } from "./node.js";
import { createGuardedFetch } from "./guarded-fetch.js";
import {
  PROXY,
  TOKEN,
  defineShellSuite,
  makeCache,
  proxyRequest,
  restoreGlobals,
  stubGlobals,
  urlRequest,
} from "./shell-cases.mjs";
import { allowLoopbackForTest, fakeLookup, startServer } from "./guard-fixtures.mjs";

test.afterEach(restoreGlobals);

// The shared suite stubs `globalThis.fetch`, so hand the shell a fetch that
// reads it at call time. The guard itself is exercised below and in
// guarded-fetch.test.mjs.
const stubbableFetch = (input, init) => globalThis.fetch(input, init);

test.describe("node shell", () =>
  defineShellSuite((request, { env = {}, cache = makeCache() } = {}) =>
    createHandler(env, { cache, fetch: stubbableFetch })(request)
  ));

function captureLogs() {
  const logged = [];
  console.log = (...args) => logged.push(args.join(" "));
  return logged;
}

// ---------------------------------------------------------------------------
// Connect-time SSRF guard (DNS rebinding)
// ---------------------------------------------------------------------------

test("refuses a target whose hostname resolves to loopback", async () => {
  const internal = await startServer();
  try {
    const logged = captureLogs();
    const { lookup } = fakeLookup({ "rebind.test": ["127.0.0.1"] });
    const handler = createHandler({ PUBLIC: "true" }, { fetch: createGuardedFetch({ lookup, timeoutMs: 1000 }) });
    const response = await handler(proxyRequest(`http://rebind.test:${internal.port}/admin`));
    assert.equal(response.status, 502);
    assert.deepEqual(internal.hits, [], "the internal service must never be reached");
    assert.match(logged.join("\n"), /blocked non-public address/);
  } finally {
    await internal.close();
  }
});

test("refuses private, CGNAT, link-local and metadata resolutions", async () => {
  for (const address of ["10.0.0.1", "192.168.1.1", "100.64.0.1", "169.254.169.254", "fe80::1", "::ffff:10.0.0.1"]) {
    const logged = captureLogs();
    const { lookup } = fakeLookup({ "evil.test": [address] });
    const handler = createHandler({ PUBLIC: "true" }, { fetch: createGuardedFetch({ lookup, timeoutMs: 1000 }) });
    const response = await handler(proxyRequest("http://evil.test/"));
    assert.equal(response.status, 502, address);
    assert.match(logged.join("\n"), /blocked non-public address/, address);
  }
});

test("refuses a redirect to a hostname that resolves to a private address", async () => {
  const upstream = await startServer((req, res) => {
    res.writeHead(302, { location: "http://metadata.test/latest/meta-data/" });
    res.end();
  });
  try {
    const logged = captureLogs();
    const { lookup, asked } = fakeLookup({
      "public.test": ["127.0.0.1"], // allowed for this test only
      "metadata.test": ["169.254.169.254"],
    });
    const fetch = createGuardedFetch({ lookup, isBlocked: allowLoopbackForTest, timeoutMs: 1000 });
    const handler = createHandler({ PUBLIC: "true" }, { fetch });
    const response = await handler(proxyRequest(`http://public.test:${upstream.port}/article`));
    assert.equal(response.status, 502);
    assert.deepEqual(upstream.hits, ["/article"], "the first hop is fetched");
    assert.deepEqual(asked, ["public.test", "metadata.test"], "the redirect hop is resolved through the guard");
    assert.match(logged.join("\n"), /blocked non-public address for metadata\.test/);
  } finally {
    await upstream.close();
  }
});

test("proxies a hostname that resolves to an allowed address", async () => {
  const upstream = await startServer((req, res) => {
    res.writeHead(200, { "content-type": "text/html" });
    res.end("<html>article</html>");
  });
  try {
    const { lookup } = fakeLookup({ "public.test": ["127.0.0.1"] });
    const fetch = createGuardedFetch({ lookup, isBlocked: allowLoopbackForTest, timeoutMs: 1000 });
    const handler = createHandler({ PUBLIC: "true" }, { fetch });
    const response = await handler(proxyRequest(`http://public.test:${upstream.port}/article`));
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "<html>article</html>");
    assert.equal(response.headers.get("access-control-allow-origin"), "*");
  } finally {
    await upstream.close();
  }
});

test("guards by default: an IPv6 literal that core lets through is still refused", async () => {
  const logged = captureLogs();
  const handler = createHandler({ PUBLIC: "true" });
  // NAT64 for 127.0.0.1: core's literal check doesn't know the prefix.
  const response = await handler(proxyRequest("http://[64:ff9b::7f00:1]/"));
  assert.equal(response.status, 502);
  assert.match(logged.join("\n"), /blocked non-public address/);
});

// ---------------------------------------------------------------------------
// Node-specific configuration
// ---------------------------------------------------------------------------

test("the setup page explains setting PROXY_TOKENS in the environment, not wrangler", async () => {
  const response = await createHandler({})(urlRequest(PROXY));
  const body = await response.text();
  assert.match(body, /PROXY_TOKENS/);
  assert.doesNotMatch(body, /wrangler/);
});

test("reads PROXY_TOKENS, PUBLIC and ALLOWED_ORIGINS from the environment", async () => {
  stubGlobals();
  const locked = createHandler({ PROXY_TOKENS: `old, ${TOKEN}` }, { fetch: stubbableFetch });
  assert.equal((await locked(urlRequest(`${PROXY}${TOKEN}/?url=https%3A%2F%2Fexample.com%2F`))).status, 200);
  assert.equal((await locked(proxyRequest("https://example.com/"))).status, 404);

  const open = createHandler({ PUBLIC: "TRUE" }, { fetch: stubbableFetch });
  assert.equal((await open(proxyRequest("https://example.com/"))).status, 200);

  const allowlisted = createHandler(
    { PUBLIC: "true", ALLOWED_ORIGINS: "https://savr.link" },
    { fetch: stubbableFetch }
  );
  assert.equal((await allowlisted(proxyRequest("https://example.com/"))).status, 404);
});

// ---------------------------------------------------------------------------
// HTTP server adapter
// ---------------------------------------------------------------------------

async function listen(handler) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    base: `http://127.0.0.1:${server.address().port}`,
    close() {
      server.closeAllConnections();
      return new Promise((resolve) => server.close(resolve));
    },
  };
}

test("serves the handler over HTTP: status, headers, streamed body and HEAD", async () => {
  const seen = [];
  const server = await listen(async (request) => {
    seen.push(request);
    const headers = new Headers({ "content-type": "text/plain", "x-from": "handler" });
    headers.append("set-cookie", "a=1");
    headers.append("set-cookie", "b=2");
    return new Response(request.method === "HEAD" ? null : "hello", { status: 203, headers });
  });
  try {
    const response = await fetch(`${server.base}/tok/?url=https%3A%2F%2Fexample.com%2F`, {
      headers: { origin: "https://savr.link", accept: "text/html" },
    });
    assert.equal(response.status, 203);
    assert.equal(await response.text(), "hello");
    assert.equal(response.headers.get("x-from"), "handler");
    assert.deepEqual(response.headers.getSetCookie(), ["a=1", "b=2"]);

    const [request] = seen;
    assert.equal(request.method, "GET");
    assert.equal(request.url, `${server.base}/tok/?url=https%3A%2F%2Fexample.com%2F`);
    assert.equal(request.headers.get("origin"), "https://savr.link");
    assert.equal(request.headers.get("accept"), "text/html");

    const head = await fetch(`${server.base}/`, { method: "HEAD" });
    assert.equal(head.status, 203);
    assert.equal(seen[1].method, "HEAD");
  } finally {
    await server.close();
  }
});

test("builds the request URL from X-Forwarded-Proto behind a TLS-terminating proxy", async () => {
  const seen = [];
  const server = await listen(async (request) => {
    seen.push(request.url);
    return new Response("ok");
  });
  try {
    await fetch(`${server.base}/x`, { headers: { "x-forwarded-proto": "https" } });
    assert.match(seen[0], /^https:\/\/127\.0\.0\.1:\d+\/x$/);
  } finally {
    await server.close();
  }
});

test("a throwing handler answers 500 with CORS headers instead of hanging", async () => {
  captureLogs();
  const server = await listen(async () => {
    throw new Error("boom");
  });
  try {
    const response = await fetch(`${server.base}/`);
    assert.equal(response.status, 500);
    assert.equal(response.headers.get("access-control-allow-origin"), "*");
  } finally {
    await server.close();
  }
});

test("the real handler over HTTP: setup page uses the Host the caller used", async () => {
  const server = await listen(createHandler({}));
  try {
    const response = await fetch(`${server.base}/`);
    assert.equal(response.status, 200);
    assert.match(await response.text(), new RegExp(`${server.base}/[0-9a-f-]{36}/\\?url=`));
  } finally {
    await server.close();
  }
});
