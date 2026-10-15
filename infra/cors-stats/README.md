# CORS proxy stats worker

Cloudflare Worker that serves a small usage dashboard for the Savr CORS proxy
(`infra/cors-worker`). It answers the questions the GoatCounter view answers for
the app: roughly how much the proxy is used, from where, and whether it is
erroring — plus a filterable "pure article count".

```
savr.link (browser) ──► cors-worker  ──►  Analytics Engine (savr_cors_stats)
                          writes one          │
                          point per request   │ SQL API
                                              ▼
maintainer ──► cors-stats worker ──► dashboard (this worker's `/`)
```

Collection lives in the proxy worker (only it sees the request), the API token
and dashboard access key live here — never in the public proxy.

## What is recorded

One Analytics Engine point per non-preflight request. **No URLs, no IPs, no
cookies, no identity.** Countries are derived by Cloudflare from the caller's IP
and the IP itself is discarded.

| blob | field | example values |
| ---- | ----- | -------------- |
| 1 | country (ISO alpha-2) | `US`, `DE`, `T1` (Tor), `XX` (unknown) |
| 2 | MIME class | `html`, `image`, `css`, `js`, `font`, `video`, `json`, `none`, … |
| 3 | status | `200`, `404`, `502` |
| 4 | cache | `hit` (edge cache), `miss` (origin fetch), `bypass` (HEAD / invalid) |
| 5 | host | **failures only** (`status >= 400`), otherwise empty |
| 6 | caller origin | `savr.link`, a self-hoster's host, `chrome-extension`, `local` (localhost / LAN / IP), `""` (none) |
| 7 | client class | `browser`, `bot`, `other`, `none` (raw UA never stored) |
| 8 | fetch error kind | **502s only**: `dns`, `timeout`, `blocked-redirect`, `redirect-loop`, `other` |

Doubles: `[1, duration_ms, bytes]` (`bytes` is the advertised
`content-length`, or `-1` when unknown/chunked). The single index value is
`proxy`. Field order, vocabularies, and the dataset name live in
`infra/cors-worker/stats-schema.js`, which both workers import — append new
fields there, never reorder. Tests fail if the proxy can emit a value the
dashboard has no filter or label for.

Because the proxy is public, totals include any non-Savr callers; the caller
origin card is what separates the hosted app from self-hosted instances,
browser extensions, and strangers. `OPTIONS` preflights are not recorded —
protocol overhead, not usage.

## The dashboard

`/` serves a tiny no-build, no-CDN page: totals (articles, requests, errors,
error rate, edge-cache hit rate, average origin fetch time, data served), a
time series, and breakdowns by country, caller origin, client class, MIME
class, cache, status, 502 failure reason, and failing host.
Filters (`24h`/`7d`/`30d`/`90d`, type, cache) are URL params, so views are
bookmarkable.

- **Articles** is deliberately unfiltered: HTML pages fetched from origin
  (`html` + cache `miss`), i.e. one per article ingest, ignoring the images,
  CSS and JS each article produces. A regular ingest of 15 images counts as
  1 article and 16 requests.
- **Failing hosts** shows `blob5`, which is only written on failures — that is
  the whole point of storing it, so error triage is possible without recording
  what was read.

Access is gated by `STATS_KEY`: either a `Authorization: Bearer <key>` header
(scripts), or the unlock form, which POSTs the key and sets a 30-day HttpOnly
session cookie holding a value derived from the key (not the key itself). The
key is never accepted in the URL, so it can't land in Workers Logs or browser
history; rotating `STATS_KEY` signs every browser out. When `STATS_KEY` is
unset the worker fails closed.

## Deploy

1. Enable Analytics Engine once for the account (Workers & Pages → Analytics
   Engine) and deploy the proxy's `STATS` binding first (see
   `infra/cors-worker/README.md`).
2. The hosted instance's account ID is already in `wrangler.toml`
   (`ACCOUNT_ID`); a self-hosted copy must replace it with its own.
3. Create an API token with the **Account Analytics: Read** permission.
4. Set the secrets:

   ```bash
   cd infra/cors-stats
   npx wrangler secret put CF_API_TOKEN   # the Account Analytics: Read token
   npx wrangler secret put STATS_KEY      # a long random access key
   npx wrangler deploy
   ```

5. Open the worker URL, enter the access key, and bookmark it. The key is
   exchanged for a session cookie.

## Test

```bash
node --test 'infra/cors-stats/*.test.mjs'
```

## Limits and caveats

- Analytics Engine free plan: 100,000 data points written and 10,000 read
  queries per day; 90-day retention. Each dashboard load runs 12 read queries.
- Analytics Engine samples busy series automatically; every query therefore
  counts with `SUM(_sample_interval)`, and the numbers are **estimates**
  (accurate to the rough "how are things going" level, not billing-grade).
- Only the last 90 days exist, so `90d` is the widest range.
- `request.cf.country` needs a real deployment; `wrangler dev` reports `XX`.
