/**
 * Savr CORS proxy analytics — Cloudflare Worker.
 *
 * The read side of the proxy statistics pipeline:
 *
 *  - the proxy worker (infra/cors-worker) writes one Analytics Engine point
 *    per recorded request: country, MIME class, status, cache outcome, caller
 *    origin, client class, and — only on failures — the host and fetch-error
 *    kind, plus duration and size. No URLs, no IPs;
 *  - this worker queries those points through the Analytics Engine SQL API and
 *    serves a small usage dashboard.
 *
 * Keeping the two separate means the public proxy never holds the Cloudflare
 * API token; it lives only here (as a secret), next to the dashboard's own
 * access key.
 *
 * The schema (field order, vocabularies, dataset name) is imported from
 * infra/cors-worker/stats-schema.js, so the reader can't drift from the writer.
 *
 * Deploy: see README.md. `npx wrangler deploy` plus two secrets.
 */

import { renderDashboard, renderUnlock } from "./dashboard.js";
import {
  CACHE_OUTCOMES,
  DATASET,
  MIME_BUCKETS,
  blob,
  double,
} from "../cors-worker/stats-schema.js";

const SQL_API = "https://api.cloudflare.com/client/v4/accounts";

// Time ranges the dashboard offers: window in days plus the chart bucket size
// in seconds (hourly for a day, 6-hourly for a week, daily beyond).
export const RANGES = {
  "24h": { days: 1, bucket: 3600 },
  "7d": { days: 7, bucket: 21600 },
  "30d": { days: 30, bucket: 86400 },
  "90d": { days: 90, bucket: 86400 },
};

export const MIMES = ["all", ...MIME_BUCKETS];

export const CACHES = ["all", ...CACHE_OUTCOMES];

const COUNT = "SUM(_sample_interval)";

/**
 * Build the dashboard's SQL. Every interpolated value is picked from the
 * maps/arrays above or the shared schema (or is a clamped integer), so callers
 * cannot inject SQL. Counts are `SUM(_sample_interval)` because Analytics
 * Engine samples busy series automatically — plain `count()` would undercount.
 */
export function buildQueries({ range = "7d", mime = "all", cache = "all" } = {}) {
  const { days, bucket } = RANGES[range] ?? RANGES["7d"];
  const mimeValue = MIMES.includes(mime) ? mime : "all";
  const cacheValue = CACHES.includes(cache) ? cache : "all";

  const filters = [];
  if (mimeValue !== "all") filters.push(`${blob("mime")} = '${mimeValue}'`);
  if (cacheValue !== "all") filters.push(`${blob("cache")} = '${cacheValue}'`);
  const filter = filters.length ? ` AND ${filters.join(" AND ")}` : "";
  const where = `WHERE timestamp > NOW() - INTERVAL '${days}' DAY${filter}`;

  // One "count per value of a field" breakdown, largest first.
  const breakdown = (field, alias, { limit, extra = "" } = {}) =>
    `SELECT ${blob(field)} AS ${alias}, ${COUNT} AS n FROM ${DATASET} ${where}${extra} GROUP BY ${alias} ORDER BY n DESC${limit ? ` LIMIT ${limit}` : ""}`;

  const status = `toUInt32(${blob("status")})`;
  const duration = double("durationMs");
  const bytes = double("bytes");

  return {
    series: `SELECT intDiv(toUInt32(timestamp), ${bucket}) * ${bucket} AS t, ${COUNT} AS n FROM ${DATASET} ${where} GROUP BY t ORDER BY t`,
    countries: breakdown("country", "country", { limit: 20 }),
    origins: breakdown("origin", "origin", { limit: 20 }),
    clients: breakdown("client", "client"),
    mimes: breakdown("mime", "mime"),
    caches: breakdown("cache", "cache"),
    statuses: breakdown("status", "status"),
    errors: breakdown("errorKind", "kind", { extra: ` AND ${blob("errorKind")} != ''` }),
    hosts: `SELECT ${blob("host")} AS host, ${blob("status")} AS status, ${COUNT} AS n FROM ${DATASET} ${where} AND ${status} >= 400 AND ${blob("host")} != '' GROUP BY host, status ORDER BY n DESC LIMIT 20`,
    // Mean time to answer from origin (misses only; hits are ~instant).
    timing: `SELECT SUM(_sample_interval * ${duration}) / SUM(_sample_interval) AS ms FROM ${DATASET} ${where} AND ${blob("cache")} = 'miss'`,
    // Advertised bytes served; chunked responses (-1) are unknown, so skipped.
    volume: `SELECT SUM(_sample_interval * ${bytes}) AS bytes FROM ${DATASET} ${where} AND ${bytes} >= 0`,
    // Deliberately unfiltered by MIME: this is the headline "pure article
    // count" — HTML pages fetched from origin (edge-cache misses), one per
    // ingest, ignoring the image/CSS/JS noise each article produces.
    articles: `SELECT ${COUNT} AS n FROM ${DATASET} WHERE timestamp > NOW() - INTERVAL '${days}' DAY AND ${blob("mime")} = 'html' AND ${blob("cache")} = 'miss'`,
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

/**
 * The cookie holds a value derived from STATS_KEY rather than the key itself,
 * so a leaked cookie can't be replayed as a bearer token, and rotating the key
 * signs every browser out.
 */
export async function sessionToken(key) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`savr-cors-stats-session:${key}`)
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function isAuthorized(request, env) {
  if (!env.STATS_KEY) return false; // fail closed when unconfigured
  const auth = request.headers.get("authorization") || "";
  if (auth.startsWith("Bearer ")) return timingSafeEqual(auth.slice(7), env.STATS_KEY);
  const cookie = request.headers.get("cookie") || "";
  const match = cookie.match(/(?:^|;\s*)stats_session=([^;]+)/);
  return Boolean(match) && timingSafeEqual(match[1], await sessionToken(env.STATS_KEY));
}

async function sessionCookie(env) {
  return `stats_session=${await sessionToken(env.STATS_KEY)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=2592000`;
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

/**
 * The unlock form POSTs the key in the body, never the URL — URLs end up in
 * Workers Logs (observability is on) and browser history.
 */
async function unlock(request, env) {
  let key = "";
  try {
    key = String((await request.formData()).get("key") || "").trim();
  } catch {
    // not a form body; treat as an empty key
  }
  if (!env.STATS_KEY || !timingSafeEqual(key, env.STATS_KEY)) {
    return html(renderUnlock("That key was not accepted."), 401);
  }
  return new Response(null, {
    status: 303,
    headers: { location: "/", "set-cookie": await sessionCookie(env) },
  });
}

const firstNumber = (rows, column) => (rows && rows[0] ? Number(rows[0][column]) || 0 : 0);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/" && request.method === "POST") return unlock(request, env);
    if (request.method !== "GET") {
      return json({ error: "method not allowed" }, 405);
    }

    if (url.pathname === "/api/stats") {
      if (!(await isAuthorized(request, env))) return json({ error: "unauthorized" }, 401);
      try {
        const queries = buildQueries(Object.fromEntries(url.searchParams));
        const { articles, timing, volume, ...results } = await runQueries(env, queries);
        return json({
          ...results,
          articles: firstNumber(articles, "n"),
          originMs: firstNumber(timing, "ms"),
          bytes: firstNumber(volume, "bytes"),
        });
      } catch (error) {
        return json({ error: error.message }, 502);
      }
    }

    if (url.pathname !== "/") return json({ error: "not found" }, 404);

    if (!(await isAuthorized(request, env))) return html(renderUnlock());

    return html(
      renderDashboard({ ranges: Object.keys(RANGES), mimes: MIMES, caches: CACHES })
    );
  },
};
