# 0001. Locked proxies authenticate with a path or query token

*Status: Accepted · 2026-10-13*

## Context

The shared CORS proxy runs on Cloudflare's free plan (100k requests/day) and everyone uses it. Users can deploy their own copy (#84), but a proxy URL pasted into a phone or shared anywhere works for anyone who sees it — an unprotected copy still leaks its quota to scanners and crawlers.

The app constructs every proxied request as `prefix + encodeURIComponent(targetUrl)` in one place (`buildProxiedUrl`), so any auth scheme has to fit inside that prefix, or the app needs a code change to use a token.

## Decision

A locked proxy accepts its token in either of two places:

- the first path segment: `https://host/<token>/?url=…`
- a `token` query parameter before `url=`: `https://host/?token=<token>&url=…`

`PROXY_TOKENS` holds a comma-separated list; every candidate is compared in constant time (no early exit). Auth is checked **before** the edge-cache lookup. A wrong or missing token returns **404**, not 401, and `OPTIONS` (preflight) stays unauthenticated. The cache key remains the target URL alone. `GET /<token>/health` (or `/health?token=`) returns `{ name, version, authRequired }` so a client can probe the proxy.

## Consequences

- The app needed no change to use a token — both shapes are just prefixes.
- Rotation is safe: add the new token, update devices, remove the old one; the cache survives because the key never includes the token.
- A locked proxy is indistinguishable from a dead host to a scanner without the token.
- This is a **bearer token that protects quota, not data**. The proxy only fetches public URLs and stores nothing; it is not an authorization boundary for anything sensitive.
- Every response our worker produces carries CORS headers — including the 404 — which lets a client tell "our worker answered" from "Cloudflare's edge answered instead" (#86's exhaustion probe depends on this).
