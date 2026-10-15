/**
 * Savr CORS proxy analytics — Cloudflare Worker.
 *
 * The read side of the proxy statistics pipeline:
 *
 *  - the proxy worker (infra/cors-worker) writes one Analytics Engine point
 *    per non-preflight request: country, MIME class, status, cache hit/miss,
 *    and the host — but only on failures. No URLs, no IPs;
 *  - this worker queries those points through the Analytics Engine SQL API and
 *    serves a small usage dashboard.
 *
 * Keeping the two separate means the public proxy never holds the Cloudflare
 * API token; it lives only here (as a secret), next to the dashboard's own
 * access key.
 *
 * Schema (blob order is load-bearing — keep in sync with the proxy worker):
 *   blob1 country, blob2 MIME class, blob3 status, blob4 cache, blob5 host,
 *   blob6 caller origin, blob7 client class, blob8 fetch error kind
 *   doubles [count=1, duration ms, bytes], index "proxy", implicit timestamp.
 *
 * Deploy: see README.md. `npx wrangler deploy` plus two secrets.
 */

import { renderDashboard, renderUnlock } from "./dashboard.js";

const DATASET = "savr_cors_stats";
const SQL_API = "https://api.cloudflare.com/client/v4/accounts";

// Time ranges the dashboard offers: window in days plus the chart bucket size
// in seconds (hourly for a day, 6-hourly for a week, daily beyond).
export const RANGES = {
  "24h": { days: 1, bucket: 3600 },
  "7d": { days: 7, bucket: 21600 },
  "30d": { days: 30, bucket: 86400 },
  "90d": { days: 90, bucket: 86400 },
};

export const MIMES = [
  "all", "html", "image", "video", "audio", "font",
  "css", "js", "pdf", "json", "xml", "text", "other", "none",
];

export const CACHES = ["all", "hit", "miss", "bypass"];

/**
 * Build the dashboard's SQL. Every interpolated value is picked from the
 * maps/arrays above (or is a clamped integer), so callers cannot inject SQL.
 * Counts are `SUM(_sample_interval)` because Analytics Engine samples busy
 * series automatically — plain `count()` would undercount.
 */
export function buildQueries({ range = "7d", mime = "all", cache = "all" } = {}) {
  const { days, bucket } = RANGES[range] ?? RANGES["7d"];
  const mimeValue = MIMES.includes(mime) ? mime : "all";
  const cacheValue = CACHES.includes(cache) ? cache : "all";

  const filters = [];
  if (mimeValue !== "all") filters.push(`blob2 = '${mimeValue}'`);
  if (cacheValue !== "all") filters.push(`blob4 = '${cacheValue}'`);
  const filter = filters.length ? ` AND ${filters.join(" AND ")}` : "";
  const window = `timestamp > NOW() - INTERVAL '${days}' DAY`;

  return {
    series: `SELECT intDiv(toUInt32(timestamp), ${bucket}) * ${bucket} AS t, SUM(_sample_interval) AS n FROM ${DATASET} WHERE ${window}${filter} GROUP BY t ORDER BY t`,
    countries: `SELECT blob1 AS country, SUM(_sample_interval) AS n FROM ${DATASET} WHERE ${window}${filter} GROUP BY country ORDER BY n DESC LIMIT 20`,
    origins: `SELECT blob6 AS origin, SUM(_sample_interval) AS n FROM ${DATASET} WHERE ${window}${filter} GROUP BY origin ORDER BY n DESC LIMIT 20`,
    clients: `SELECT blob7 AS client, SUM(_sample_interval) AS n FROM ${DATASET} WHERE ${window}${filter} GROUP BY client ORDER BY n DESC`,
    mimes: `SELECT blob2 AS mime, SUM(_sample_interval) AS n FROM ${DATASET} WHERE ${window}${filter} GROUP BY mime ORDER BY n DESC`,
    caches: `SELECT blob4 AS cache, SUM(_sample_interval) AS n FROM ${DATASET} WHERE ${window}${filter} GROUP BY cache ORDER BY n DESC`,
    statuses: `SELECT blob3 AS status, SUM(_sample_interval) AS n FROM ${DATASET} WHERE ${window}${filter} GROUP BY status ORDER BY n DESC`,
    hosts: `SELECT blob5 AS host, blob3 AS status, SUM(_sample_interval) AS n FROM ${DATASET} WHERE ${window}${filter} AND toUInt32(blob3) >= 400 AND blob5 != '' GROUP BY host, status ORDER BY n DESC LIMIT 20`,
    // Deliberately unfiltered by MIME: this is the headline "pure article
    // count" — HTML pages fetched from origin (edge-cache misses), one per
    // ingest, ignoring the image/CSS/JS noise each article produces.
    articles: `SELECT SUM(_sample_interval) AS n FROM ${DATASET} WHERE ${window} AND blob2 = 'html' AND blob4 = 'miss'`,
  };
}

/** Run every query in parallel; one SQL API read each. */
async function runQueries(env, queries) {
  if (!env.ACCOUNT_ID || !env.CF_API_TOKEN) {
    throw new Error("stats worker is not configured (ACCOUNT_ID / CF_API_TOKEN)");
  }
  const entries = await Promise.all(
    Object.entries(queries).map(async ([name, sql]) => {
      const response = await fetch(
        `${SQL_API}/${env.ACCOUNT_ID}/analytics_engine/sql`,
        {
          method: "POST",
          headers: { authorization: `Bearer ${env.CF_API_TOKEN}` },
          body: sql,
        }
      );
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 300);
        throw new Error(`SQL API ${response.status} (${name}): ${detail}`);
      }
      const payload = await response.json();
      return [name, payload.data || []];
    })
  );
  return Object.fromEntries(entries);
}

function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function accessKeyFrom(request) {
  const auth = request.headers.get("authorization") || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7);
  const fromQuery = new URL(request.url).searchParams.get("key");
  if (fromQuery) return fromQuery;
  const cookie = request.headers.get("cookie") || "";
  const match = cookie.match(/(?:^|;\s*)stats_key=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function isAuthorized(request, env) {
  if (!env.STATS_KEY) return false; // fail closed when unconfigured
  return timingSafeEqual(accessKeyFrom(request) || "", env.STATS_KEY);
}

function sessionCookie(key) {
  return `stats_key=${encodeURIComponent(key)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=2592000`;
}

function html(body, status = 200, headers = {}) {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
      ...headers,
    },
  });
}

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      ...headers,
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method !== "GET") {
      return json({ error: "method not allowed" }, 405);
    }

    if (url.pathname === "/api/stats") {
      if (!isAuthorized(request, env)) return json({ error: "unauthorized" }, 401);
      try {
        const queries = buildQueries(Object.fromEntries(url.searchParams));
        const results = await runQueries(env, queries);
        const headers = {};
        // Persist a key presented via ?key= so the unlock flow can redirect.
        if (url.searchParams.get("key")) {
          headers["set-cookie"] = sessionCookie(env.STATS_KEY);
        }
        const articles = results.articles[0] ? Number(results.articles[0].n) : 0;
        delete results.articles;
        return json({ ...results, articles }, 200, headers);
      } catch (error) {
        return json({ error: error.message }, 502);
      }
    }

    if (url.pathname !== "/") return json({ error: "not found" }, 404);

    const key = url.searchParams.get("key");
    if (key) {
      if (!timingSafeEqual(key, env.STATS_KEY || "")) {
        return html(renderUnlock("That key was not accepted."), 401);
      }
      return new Response(null, {
        status: 303,
        headers: { location: "/", "set-cookie": sessionCookie(env.STATS_KEY) },
      });
    }

    if (!isAuthorized(request, env)) return html(renderUnlock());

    return html(renderDashboard());
  },
};
