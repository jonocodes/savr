# CORS proxy worker

Cloudflare Worker behind `https://lively-cors-proxy-b569.cloudflare8899.workers.dev`,
the default CORS proxy the Savr reader uses to fetch article pages and images
from hosts that don't send CORS headers. The same code can be deployed as your
own private, token-locked instance (below).

The worker is a thin Cloudflare entry (`worker.js`) over a runtime-agnostic
core (`core.js`), so a Deno Deploy entry point can reuse it later.

## Files

- `core.js` — portable
  `handleRequest(request, { tokens, isPublic, cache, waitUntil, onRequest })`:
  auth, routing, setup page, caching, SSRF guard, and the neutral statistics
  event port. No Cloudflare globals.
- `worker.js` — Cloudflare entry: reads `PROXY_TOKENS`/`PUBLIC` from the
  environment, supplies `caches.default`, and writes statistics events to
  Analytics Engine.
- `wrangler.toml` — default (generic, locked) config plus the `[env.public]`
  open instance (which carries the stats binding).
- `.dev.vars.example` — the `PROXY_TOKENS` secret, for local `wrangler dev`
  and the Deploy to Cloudflare button.
- `worker.test.mjs` — unit tests (`node --test`).

## Deploy your own (token-locked)

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/jonocodes/savr/tree/main/infra/cors-worker)

The button clones `infra/cors-worker` into your Cloudflare account and prompts
for `PROXY_TOKENS`. Easiest path:

1. Deploy without setting `PROXY_TOKENS` (or via `npx wrangler deploy`).
2. Open the worker URL in a browser. It serves a **setup page** with a freshly
   generated UUID, the `wrangler secret put PROXY_TOKENS` command, and the
   exact string to paste into Savr.
3. Set the secret, then paste the shown
   `https://<worker>/<token>/?url=` string into **Preferences → CORS Proxy**.

With neither `PROXY_TOKENS` nor `PUBLIC` set the worker never proxies: a
forgotten step can't leave an open proxy. Rotate by setting the secret to a
comma-separated list (`old,new`), updating your devices, then dropping `old`.

CLI deploy: `npx wrangler deploy --env=""` from this directory (requires
Cloudflare auth: `CLOUDFLARE_API_TOKEN` or `wrangler login`). The explicit
empty env targets the top-level worker — without it wrangler warns that
`[env.public]` also exists. The shared public instance deploys with
`npx wrangler deploy --env public`.

## Token auth

A locked proxy accepts the token in either place, so both work with Savr's
"prefix + `encodeURIComponent(url)`" pattern (no app code change):

```
https://proxy.example/<token>/?url=…          ← path segment
https://proxy.example/?token=<token>&url=…    ← query parameter
```

- Auth is checked **before** the edge-cache lookup, so a cache hit is never
  served without a token.
- A wrong or missing token returns **404**, not 401, so the proxy looks dead
  to scanners. `OPTIONS` (preflight) stays unauthenticated.
- Tokens are compared in constant time, and every configured token is
  compared so the list size isn't leaked by timing.
- The cache key is the target URL only, so rotating a token doesn't throw
  away the cache.
- `GET /<token>/health` (or `/health?token=<token>`) returns
  `{ name: "savr-cors-proxy", version, authRequired }`. On the public
  instance `/health` needs no token and reports `authRequired: false`.

## What it does

`GET|HEAD /?url=<absolute-url>` fetches `<absolute-url>` and streams it back
with `Access-Control-Allow-Origin: *`. `OPTIONS` answers preflight.

## Hardening beyond the original

- **Caching.** The original passed the upstream `Cache-Control` straight through.
  A dead Substack image answered `404` with `cache-control: no-cache`, so a
  client retrying it re-fetched it forever (~234k requests in one day). Now the
  worker overrides caching by status/content-type (images immutable for a year,
  HTML for 5 min, 404s for an hour) and stores responses in the edge cache
  (`caches.default`), so repeats don't reach the origin.
- **SSRF guard.** Only `http(s)`; loopback, private, link-local, CGNAT and
  reserved addresses are refused, and every redirect hop is re-validated.
- **Size cap.** Responses advertising more than 25 MiB are refused with `413`.
- **Log hygiene.** Only errors are logged, and only the hostname — never the
  full `?url=` (which can carry API keys). The old per-request logging was also
  needlessly expensive.

There is intentionally **no host allowlist** — it must work for arbitrary
public sites.

## Usage statistics

The shared public instance writes one Analytics Engine point per recorded
request (binding `STATS`, dataset `savr_cors_stats`): country, MIME class,
status, cache outcome (hit/miss/bypass), the caller app (Origin hostname or
scheme) and client class (browser/bot/other, from a bucketed UA) — plus, on
failures only, the host, and on 502s the fetch-error kind. Response size and
duration are recorded as numbers. No URLs, no IPs, no raw user agent.
Preflights, health checks and setup pages are not recorded. The core emits
these as neutral events through its `onRequest` port; only the Cloudflare entry
turns them into data points, and only under `[env.public]`, so self-hosted
deploys write nothing. The separate stats worker (`infra/cors-stats`) queries
and displays them; see its README for the schema and the dashboard.

## Test

```bash
cd infra/cors-worker && node --test
# or, from the repo root:
node --test "infra/cors-worker/*.test.mjs" "infra/cors-stats/*.test.mjs"
```

## What this does *not* fix

The Workers Free plan caps a worker at 100k requests/day (Cloudflare error
`1027`). Edge caching does **not** avoid the invocation — a cached hit still
invokes the worker — so this worker cannot, on its own, keep the app under the
cap. The primary defense is the **browser** cache (the `Cache-Control` above
makes browsers stop re-requesting) plus the app-side fetch governor
(`src/utils/net/fetchGovernor.ts`), which de-dupes, negative-caches and backs
off so the app never generates the retry storm in the first place.
