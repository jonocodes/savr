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
import { toDataPoint } from "./stats-schema.js";

/**
 * Write one aggregate data point to Analytics Engine. The field order lives in
 * stats-schema.js, shared with the stats worker (infra/cors-stats). `host` is
 * only emitted for failures and `errorKind` only for 502s, mirroring the
 * error-log hygiene. The binding exists only on the shared public instance
 * ([env.public] in wrangler.toml); self-hosted deploys write nothing.
 *
 * Statistics must never cost a proxied response, so a failing write is logged
 * and swallowed.
 */
function recordStat(env, request, event) {
  if (!env.STATS) return;
  try {
    env.STATS.writeDataPoint(toDataPoint(event, request.cf && request.cf.country));
  } catch (error) {
    console.log(`stats write failed error=${error && error.message}`);
  }
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
