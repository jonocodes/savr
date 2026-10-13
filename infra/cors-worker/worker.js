/**
 * Savr CORS proxy — Cloudflare Worker entry point.
 *
 * Thin wrapper around the portable core in `core.js`; all behaviour (token
 * auth, setup page, health, caching, SSRF guard) lives there so it can be
 * reused by the Deno entry point.
 *
 * Deploy: `npx wrangler deploy --env=""` from this directory (see README.md).
 * The shared public instance deploys with `npx wrangler deploy --env public`.
 */

import { handleRequest, parseTokens } from "./core.js";

export default {
  fetch(request, env, ctx) {
    return handleRequest(request, {
      tokens: parseTokens(env.PROXY_TOKENS),
      isPublic: String(env.PUBLIC || "").toLowerCase() === "true",
      cache: globalThis.caches?.default,
      waitUntil: (promise) => ctx.waitUntil(promise),
    });
  },
};
