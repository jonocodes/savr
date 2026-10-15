/**
 * Savr CORS proxy — Cloudflare Worker entry point.
 *
 * Thin wrapper around the portable core in `core.js`; all behaviour (token
 * auth, setup page, health, caching, SSRF guard) lives there so it can be
 * reused by the Deno entry point. This file adds the one Cloudflare-specific
 * piece: writing the core's statistics events to Analytics Engine.
 *
 * Deploy: `npx wrangler deploy --env=""` from this directory (see README.md).
 * The shared public instance deploys with `npx wrangler deploy --env public`.
 */

import { handleRequest, parseTokens } from "./core.js";

/**
 * Write one aggregate data point (Analytics Engine, fire-and-forget). Blob
 * order is the schema — the stats worker (infra/cors-stats) queries
 * blob1..blob8 positionally:
 *   blob1 country, blob2 MIME class, blob3 status, blob4 cache (hit/miss/
 *   bypass), blob5 host, blob6 caller origin, blob7 client class, blob8 fetch
 *   error kind. `host` is only emitted for failures and `errorKind` only for
 *   502s, mirroring the error-log hygiene. The binding exists only on the
 *   shared public instance ([env.public] in wrangler.toml); self-hosted
 *   deploys have no binding and write nothing.
 */
function recordStat(env, request, event) {
  if (!env.STATS) return;
  env.STATS.writeDataPoint({
    indexes: ["proxy"],
    blobs: [
      (request.cf && request.cf.country) || "XX",
      event.mime,
      String(event.status),
      event.cache,
      event.host,
      event.origin,
      event.client,
      event.errorKind,
    ],
    doubles: [1, event.durationMs, event.bytes],
  });
}

export default {
  fetch(request, env, ctx) {
    return handleRequest(request, {
      tokens: parseTokens(env.PROXY_TOKENS),
      isPublic: String(env.PUBLIC || "").toLowerCase() === "true",
      cache: globalThis.caches?.default,
      waitUntil: (promise) => ctx.waitUntil(promise),
      onRequest: (event) => recordStat(env, request, event),
    });
  },
};
