import test from "node:test";
import assert from "node:assert/strict";
import worker, { CACHES, MIMES, buildQueries, sessionToken } from "./worker.js";
import { CACHE_LABELS, CLIENT_LABELS, ERROR_LABELS, MIME_LABELS } from "./dashboard.js";
import {
  CACHE_OUTCOMES,
  CLIENT_CLASSES,
  FETCH_ERROR_KINDS,
  MIME_BUCKETS,
} from "../cors-worker/stats-schema.js";

const BASE = "https://stats.test/";
const KEY = "test-key";
const SESSION = await sessionToken(KEY);

function env(overrides = {}) {
  return { STATS_KEY: KEY, ACCOUNT_ID: "account-123", CF_API_TOKEN: "api-token", ...overrides };
}

function authed(path) {
  return new Request(`${BASE}${path}`, { headers: { cookie: `stats_session=${SESSION}` } });
}

function unlockRequest(key) {
  return new Request(BASE, { method: "POST", body: new URLSearchParams({ key }) });
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

test("rejects a wrong key without unlocking", async () => {
  const response = await worker.fetch(unlockRequest("nope"), env());
  assert.equal(response.status, 401);
  const body = await response.text();
  assert.ok(body.includes("not accepted"));
  assert.equal(response.headers.get("set-cookie"), null);
});

test("unlocks via a POSTed key with a derived session cookie, never the raw key", async () => {
  const response = await worker.fetch(unlockRequest(KEY), env());
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "/");
  const cookie = response.headers.get("set-cookie");
  assert.match(cookie, new RegExp(`^stats_session=${SESSION};`));
  assert.match(cookie, /HttpOnly/);
  assert.ok(!cookie.includes(KEY), "raw key must not be stored in the cookie");
});

test("never accepts the key from the URL", async () => {
  const root = await worker.fetch(new Request(`${BASE}?key=${KEY}`), env());
  assert.equal(root.status, 200);
  assert.ok((await root.text()).includes("Access key"), "still the unlock page");
  assert.equal(root.headers.get("set-cookie"), null);

  stubSqlApi();
  const api = await worker.fetch(new Request(`${BASE}api/stats?key=${KEY}`), env());
  assert.equal(api.status, 401);
});

test("the session cookie is not a bearer token, and the raw key is not a cookie", async () => {
  const sessionAsBearer = await worker.fetch(
    new Request(`${BASE}api/stats`, { headers: { authorization: `Bearer ${SESSION}` } }),
    env()
  );
  assert.equal(sessionAsBearer.status, 401);
  const keyAsCookie = await worker.fetch(
    new Request(`${BASE}api/stats`, { headers: { cookie: `stats_session=${KEY}` } }),
    env()
  );
  assert.equal(keyAsCookie.status, 401);
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

  assert.equal(calls.length, 12, "series, countries, origins, clients, mimes, caches, statuses, errors, hosts, timing, volume, articles");
  for (const call of calls) {
    assert.equal(call.url, "https://api.cloudflare.com/client/v4/accounts/account-123/analytics_engine/sql");
    assert.equal(call.init.headers.authorization, "Bearer api-token");
    assert.match(call.init.body, /FROM savr_cors_stats/);
    assert.match(call.init.body, /SUM\(_sample_interval\b/, "sample-weighted");
  }
  const bodies = calls.map((call) => call.init.body).join("\n");
  assert.match(bodies, /blob6 AS origin/);
  assert.match(bodies, /blob7 AS client/);
  const filtered = calls.filter((call) => call.init.body.includes("blob2 = 'html'"));
  assert.ok(filtered.length >= 5, "mime filter applied to the per-dimension queries");

  const body = await response.json();
  assert.equal(body.articles, 7);
  assert.deepEqual(body.series, [{ n: 7 }]);
  assert.deepEqual(body.errors, [{ n: 7 }], "502 breakdown");
  assert.equal(body.timing, undefined, "scalar queries are unwrapped");
  assert.equal(body.volume, undefined);
  assert.equal(body.originMs, 0, "missing ms column reads as 0");
  assert.equal(body.bytes, 0);
});

test("unwraps the timing and data-served scalars", async () => {
  globalThis.fetch = async (url, init) => {
    const data = init.body.includes(" AS ms ")
      ? [{ ms: 123.4 }]
      : init.body.includes(" AS bytes ")
        ? [{ bytes: 2048 }]
        : [{ n: 1 }];
    return new Response(JSON.stringify({ data }), { status: 200 });
  };
  const body = await (await worker.fetch(authed("api/stats"), env())).json();
  assert.equal(body.originMs, 123.4);
  assert.equal(body.bytes, 2048);
});

test("the reader is built from the shared schema", () => {
  assert.deepEqual(MIMES, ["all", ...MIME_BUCKETS]);
  assert.deepEqual(CACHES, ["all", ...CACHE_OUTCOMES]);
  const queries = buildQueries({ range: "7d" });
  assert.match(queries.errors, /blob8 AS kind/);
  assert.match(queries.errors, /blob8 != ''/);
  assert.match(queries.timing, /double2/);
  assert.match(queries.timing, /blob4 = 'miss'/);
  assert.match(queries.volume, /double3 >= 0/);
});

test("every vocabulary value has a dashboard label", () => {
  for (const value of MIME_BUCKETS) assert.ok(MIME_LABELS[value], `mime ${value}`);
  for (const value of CACHE_OUTCOMES) assert.ok(CACHE_LABELS[value], `cache ${value}`);
  for (const value of CLIENT_CLASSES) assert.ok(CLIENT_LABELS[value], `client ${value}`);
  for (const value of FETCH_ERROR_KINDS) assert.ok(ERROR_LABELS[value], `error ${value}`);
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
  const post = await worker.fetch(new Request(`${BASE}api/stats`, { method: "POST" }), env());
  assert.equal(post.status, 405);
  const unconfigured = await worker.fetch(unlockRequest(""), env({ STATS_KEY: undefined }));
  assert.equal(unconfigured.status, 401, "fails closed when STATS_KEY is unset");
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
