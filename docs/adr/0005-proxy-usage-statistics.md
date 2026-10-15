# 0005. Proxy usage statistics live in Analytics Engine behind a separate stats worker

*Status: Accepted · 2026-10-14*

## Context

The shared proxy needed operational visibility — roughly how much it is used, from where, whether it is erroring, and a noise-free article count — like the GoatCounter view the app already has. The proxy is public and quota-bound (100k requests/day on the free plan), so we also want to see retry storms, scrapers, and quota pressure coming.

Options considered: tailing Workers Logs (Tail Workers/Logpush are Workers Paid features; Workers Logs is dashboard-only with short retention and no aggregation API), a third-party analytics service (the proxy is deliberately self-hostable and privacy-first), and Cloudflare's Workers Analytics Engine (available on the free plan, SQL-queryable, 90-day retention).

## Decision

- The proxy writes **one Analytics Engine data point per recorded request**, with `SUM(_sample_interval)` queries to respect AE's automatic sampling. Preflights, health checks, and setup pages are not recorded — protocol overhead, not usage.
- The core stays platform-neutral: it emits a plain statistics event through an `onRequest` options port (per [ADR 0003](0003-portable-proxy-core.md)); only the Cloudflare entry writes it to AE, and only under `[env.public]`, so self-hosted deploys carry no binding and write nothing.
- **Privacy contract:** country (IP-derived, IP discarded), MIME class, status, cache outcome, caller origin hostname/scheme, client class from a bucketed UA — plus host and fetch-error kind **on failures only**. No URLs, IPs, or raw user agents. Documented in `docs/TELEMETRY.md`.
- Reading is a **separate stats worker** (`infra/cors-stats`) holding the Cloudflare API token and its own access key. The public proxy never holds an account-level token.
- The dashboard's "articles" metric is HTML + cache-miss fetches — one per ingest, ignoring the images/CSS/JS each article produces.

## Consequences

- Statistics share the free-plan budget (100k data points/day written, 10k read queries/day) and are estimates under sampling; the dashboard is a rough operational signal, not billing-grade.
- Blob order is a positional schema shared by two workers (`core.js`/`worker.js` emit, `infra/cors-stats` queries); adding a field means updating both plus the READMEs.
- The proxy operator (us) can see usage patterns; the contract above is the line we hold — anything more granular (full URLs, raw UA, per-user identity) is out of scope.
- Retention is 90 days; longer history would require exporting or a new decision.
