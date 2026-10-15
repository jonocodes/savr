# infra/cors-proxy-analytics
*Started: 2026-10-14 · Updated: 2026-10-14*

**What this branch did**
Added anonymous aggregate usage statistics to the shared CORS proxy (Analytics Engine writes from the worker) plus a separate `infra/cors-stats` worker that queries AE and serves a GoatCounter-style dashboard. Merged on top of the #84 core.js refactor: the portable core now emits neutral stats events through an `onRequest` port and only the Cloudflare entry writes them, under `[env.public]`.

**Decisions**
- Analytics Engine as the store — Tail Workers and Logpush are Workers Paid; Workers Logs is dashboard-only with short retention and no aggregation API. AE is free-tier, SQL-queryable, 90-day retention, and auto-samples.
- A **separate stats worker** holds the CF API token (Account Analytics: Read) and the dashboard access key; the public proxy holds no account-level token.
- Schema: blob1 country, blob2 MIME class, blob3 status, blob4 cache (hit/miss/bypass), blob5 host (failures only), blob6 caller origin, blob7 client class, blob8 502 kind; doubles [1, ms, bytes]; constant index "proxy".
- "Articles" = html + cache-miss fetches, deliberately unfiltered in the dashboard — one per ingest, ignoring the ~15 images each article produces.
- Recording goes through the core's `onRequest` port (platform-specific capability via options port, per ADR 0003); the AE binding exists only under `[env.public]`, so self-hosted deploys write nothing.
- Preflights, health checks, and setup pages are not recorded.

**Rejected**
- Tailing CF logs for collection — Tail Workers/Logpush are paid-plan; logs can't be aggregated on free.
- An app-version header for release attribution — a custom header isn't CORS-safelisted, so it would make every proxied fetch preflighted, doubling invocations against the 100k/day cap. A query-param variant was deferred (custom-proxy compat).
- Storing hostname on all requests, full URLs, raw UA, ASN/city, or unique-user estimates — violates the proxy's privacy contract (see ADR 0005 / TELEMETRY.md).
- Recording preflights to count quota — the CF dashboard already shows invocations; would double data points.

**Gotchas**
- Blob order is a positional schema; since the review follow-up it lives only in `infra/cors-worker/stats-schema.js` (imported by both workers — wrangler bundles the cross-directory import). Append fields, never reorder.
- AE queries must use `SUM(_sample_interval)`, never `count()` — AE samples automatically and the dashboard numbers are estimates.
- Node 24 removed directory arguments for `node --test`; use quoted globs (`node --test 'infra/*/*.test.mjs'`).
- `request.cf.country` is absent in local dev — points record "XX".
- The stats worker's SQL reads are 12 per dashboard load; free tier allows 10k read queries/day.
- `wrangler deploy` for the stats worker needs `ACCOUNT_ID` in its wrangler.toml plus two secrets (`CF_API_TOKEN`, `STATS_KEY`); the AE dataset auto-creates on first write.
- The public instance deploy is `npx wrangler deploy --env public` (default deploy would create an open `savr-cors-proxy` instead).
- Analytics Engine must be enabled once per account in the dashboard before any AE binding can deploy (`wrangler` fails with error `10089` otherwise).

**Open threads**
- Dashboard unlock no longer accepts `?key=` (POST form + derived `stats_session` cookie); old `stats_key` cookies stop working, so re-unlock once after deploy.
- Release attribution remains unsolved without a preflight-free mechanism.

**Notes**
- Deployed 2026-10-15: proxy `--env public` with the `STATS` binding, and `savr-cors-stats` (account ID pinned in its wrangler.toml; `CF_API_TOKEN` + `STATS_KEY` secrets). Dashboard: https://savr-cors-stats.cloudflare8899.workers.dev — verified end-to-end against real traffic.
