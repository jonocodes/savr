# CORS proxy worker

Cloudflare Worker behind `https://lively-cors-proxy-b569.cloudflare8899.workers.dev`,
the default CORS proxy the Savr reader uses to fetch article pages and images
from hosts that don't send CORS headers.

Previously this only existed in the Cloudflare dashboard (`source: dash`). It
now lives here so it is versioned, testable, and reviewable. `wrangler.toml`
keeps the same `name`, so a deploy updates the existing worker in place.

## Files

- `worker.js` — the worker (no build step; deployed as-is).
- `wrangler.toml` — worker name, entry point, compatibility date, observability.
- `worker.test.mjs` — unit tests (`node --test`).

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
- **No header passthrough of credentials.** Only `Accept`, `Accept-Language`
  and `Range` are forwarded upstream.

There is intentionally **no host allowlist** — it must work for arbitrary
public sites.

## Deploy

```bash
cd infra/cors-worker
npx wrangler deploy          # requires Cloudflare auth (CLOUDFLARE_API_TOKEN / login)
```

## Test

```bash
node --test infra/cors-worker/
```

## What this does *not* fix

The Workers Free plan caps a worker at 100k requests/day (Cloudflare error
`1027`). Edge caching does **not** avoid the invocation — a cached hit still
invokes the worker — so this worker cannot, on its own, keep the app under the
cap. The primary defense is the **browser** cache (the `Cache-Control` above
makes browsers stop re-requesting) plus the app-side fetch governor
(`src/utils/net/fetchGovernor.ts`), which de-dupes, negative-caches and backs
off so the app never generates the retry storm in the first place.
