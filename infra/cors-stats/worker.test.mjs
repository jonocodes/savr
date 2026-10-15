import test from "node:test";
import assert from "node:assert/strict";
import worker, { buildQueries } from "./worker.js";

const BASE = "https://stats.test/";
const KEY = "test-key";

function env(overrides = {}) {
  return { STATS_KEY: KEY, ACCOUNT_ID: "account-123", CF_API_TOKEN: "api-token", ...overrides };
}

function authed(path) {
  return new Request(`${BASE}${path}`, { headers: { cookie: `stats_key=${KEY}` } });
}

const originalFetch = globalThis.fetch;

function stubSqlApi({ data = [{ n: 5 }], ok = true, status = 200 } = {}) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    if (!ok) return new Response("bad token", { status });
    return new Response(JSON.stringify({ data }), { status: 200 });
  };
  return calls;
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("serves an unlock page when unauthenticated", async () => {
  const response = await worker.fetch(new Request(BASE), env());
  assert.equal(response.status, 200);
  const body = await response.text();
  assert.ok(body.includes("Access key"), "unlock form");
  assert.ok(!body.includes("Requests over time"), "no dashboard content");
});

test("rejects a wrong key on the root without unlocking", async () => {
  const response = await worker.fetch(new Request(`${BASE}?key=nope`), env());
  assert.equal(response.status, 401);
  const body = await response.text();
  assert.ok(body.includes("not accepted"));
  assert.equal(response.headers.get("set-cookie"), null);
});

test("bootstraps a session cookie from a correct ?key= and redirects", async () => {
  const response = await worker.fetch(new Request(`${BASE}?key=${KEY}`), env());
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "/");
  assert.match(response.headers.get("set-cookie"), new RegExp(`^stats_key=${KEY};`));
  assert.match(response.headers.get("set-cookie"), /HttpOnly/);
});

test("unlocks the dashboard with the cookie or a bearer token", async () => {
  const viaCookie = await worker.fetch(authed(""), env());
  assert.equal(viaCookie.status, 200);
  const body = await viaCookie.text();
  assert.ok(body.includes("Requests over time"));
  assert.match(body, /"ranges":\["24h","7d","30d","90d"\]/, "range buttons must be populated");
  assert.match(body, /"mimes":\["all","html"/, "type filter must be populated");
  assert.match(body, /"caches":\["all","hit","miss","bypass"\]/, "cache filter must be populated");

  const viaBearer = await worker.fetch(
    new Request(BASE, { headers: { authorization: `Bearer ${KEY}` } }),
    env()
  );
  assert.equal(viaBearer.status, 200);
  assert.ok((await viaBearer.text()).includes("Requests over time"));
});

test("fails closed when STATS_KEY is unset", async () => {
  const response = await worker.fetch(new Request(BASE), env({ STATS_KEY: undefined }));
  assert.equal(response.status, 200);
  assert.ok((await response.text()).includes("Access key"), "still just the unlock page");

  const api = await worker.fetch(new Request(`${BASE}api/stats`), env({ STATS_KEY: undefined }));
  assert.equal(api.status, 401);
});

test("requires auth on the API", async () => {
  const response = await worker.fetch(new Request(`${BASE}api/stats`), env());
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "unauthorized");
});

test("queries the SQL API with the filters and returns aggregated JSON", async () => {
  const calls = stubSqlApi({ data: [{ n: 7 }] });
  const response = await worker.fetch(authed("api/stats?range=24h&mime=html&cache=miss"), env());
  assert.equal(response.status, 200);

  assert.equal(calls.length, 9, "series, countries, origins, clients, mimes, caches, statuses, hosts, articles");
  for (const call of calls) {
    assert.equal(call.url, "https://api.cloudflare.com/client/v4/accounts/account-123/analytics_engine/sql");
    assert.equal(call.init.headers.authorization, "Bearer api-token");
    assert.match(call.init.body, /FROM savr_cors_stats/);
    assert.match(call.init.body, /SUM\(_sample_interval\)/);
  }
  const bodies = calls.map((call) => call.init.body).join("\n");
  assert.match(bodies, /blob6 AS origin/);
  assert.match(bodies, /blob7 AS client/);
  const filtered = calls.filter((call) => call.init.body.includes("blob2 = 'html'"));
  assert.ok(filtered.length >= 5, "mime filter applied to the per-dimension queries");

  const body = await response.json();
  assert.equal(body.articles, 7);
  assert.deepEqual(body.series, [{ n: 7 }]);
});

test("sets a session cookie when the API is called with ?key=", async () => {
  stubSqlApi();
  const response = await worker.fetch(new Request(`${BASE}api/stats?key=${KEY}`), env());
  assert.equal(response.status, 200);
  assert.match(response.headers.get("set-cookie"), /HttpOnly/);
});

test("surfaces SQL API failures as 502 without leaking the token", async () => {
  stubSqlApi({ ok: false, status: 403 });
  const response = await worker.fetch(authed("api/stats"), env());
  assert.equal(response.status, 502);
  const body = await response.json();
  assert.match(body.error, /SQL API 403/);
  assert.ok(!body.error.includes("api-token"));
});

test("reports misconfiguration instead of calling upstream", async () => {
  let called = false;
  globalThis.fetch = async () => { called = true; return new Response("{}"); };
  const response = await worker.fetch(authed("api/stats"), env({ CF_API_TOKEN: undefined }));
  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /not configured/);
  assert.equal(called, false);
});

test("rejects non-GET and unknown paths", async () => {
  const post = await worker.fetch(new Request(BASE, { method: "POST" }), env());
  assert.equal(post.status, 405);
  const missing = await worker.fetch(authed("nope"), env());
  assert.equal(missing.status, 404);
});

test("buildQueries maps ranges to windows and buckets", () => {
  const week = buildQueries({ range: "7d" });
  assert.match(week.series, /INTERVAL '7' DAY/);
  assert.match(week.series, /intDiv\(toUInt32\(timestamp\), 21600\) \* 21600/);
  assert.ok(!week.series.includes("blob2"), "no filter by default");

  const day = buildQueries({ range: "24h" });
  assert.match(day.series, /INTERVAL '1' DAY/);
  assert.match(day.series, /intDiv\(toUInt32\(timestamp\), 3600\) \* 3600/);

  const quarter = buildQueries({ range: "90d" });
  assert.match(quarter.series, /INTERVAL '90' DAY/);
  assert.match(quarter.series, /86400/);
});

test("buildQueries whitelists every interpolated value", () => {
  const filtered = buildQueries({ range: "7d", mime: "image", cache: "hit" });
  assert.match(filtered.series, /blob2 = 'image'/);
  assert.match(filtered.series, /blob4 = 'hit'/);

  const bypass = buildQueries({ range: "7d", cache: "bypass" });
  assert.match(bypass.series, /blob4 = 'bypass'/);

  const hostile = buildQueries({
    range: "'; DROP TABLE savr_cors_stats; --",
    mime: "html' OR '1'='1",
    cache: "'); DELETE FROM",
  });
  assert.ok(!hostile.series.includes("DROP"));
  assert.ok(!hostile.series.includes("DELETE"));
  assert.ok(!hostile.series.includes("'1'='1"));
  assert.match(hostile.series, /INTERVAL '7' DAY/, "falls back to the default range");
  assert.ok(!hostile.series.includes("blob2"), "invalid MIME falls back to all");
});

test("the articles count is always pure (html misses, unfiltered)", () => {
  const queries = buildQueries({ range: "24h", mime: "image", cache: "hit" });
  assert.match(queries.articles, /blob2 = 'html' AND blob4 = 'miss'/);
  assert.ok(!queries.articles.includes("blob2 = 'image'"));
});
