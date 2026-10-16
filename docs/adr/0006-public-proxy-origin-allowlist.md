# 0006. The public proxy only serves allowlisted calling sites

*Status: Accepted · 2026-10-15*

## Context

The shared public proxy is open (ADR 0002) and its CORS response was `Access-Control-Allow-Origin: *`, so any website could spend its free-tier quota (100k requests/day, shared by every Savr user) by having its visitors' browsers call it. The proxy must keep fetching **arbitrary** public article hosts, so restricting *targets* is not an option; only *callers* can be restricted.

Browsers set the `Origin` header on every cross-origin `fetch()` and page script cannot change it. Every proxied request the app makes (article pages via `buildProxiedUrl`, images via `proxyImageSource`) is a `fetch()`, so legitimate traffic always carries it. The browser extension does not call the proxy at all (it fetches pages and images itself); its fallback goes through the app on savr.link.

## Decision

An optional `ALLOWED_ORIGINS` setting (comma-separated origins) restricts callers. When set:

- a request whose `Origin` is missing, `null`, or unlisted gets the same **404** as a bad token, checked before the edge-cache lookup and before any upstream fetch;
- an allowed response echoes the caller's origin in `Access-Control-Allow-Origin` (not `*`) with `Vary: Origin`;
- `OPTIONS` preflight and `/health` stay open (neither fetches anything);
- it composes with tokens — both must pass.

Patterns are origins (`scheme://host[:port]`). `*` in the host matches `[a-z0-9-]+` and never crosses a `.`; `:*` matches any port; no port means the default port only.

The public instance sets it in `[env.public.vars]` to production, Netlify preview/branch deploys and local dev: `https://savr.link,https://*--savrlist.netlify.app,http://localhost:*,http://127.0.0.1:*`. When unset (the default, and every self-hosted proxy), behaviour is unchanged.

## Consequences

- Other websites can no longer use the public proxy from browsers. Self-hosted Savr frontends on their own domain can't either; they deploy their own proxy (or set `VITE_CORS_PROXY`), which already works.
- This is **not** protection against scripts: a non-browser client can forge `Origin`. Per-IP rate limiting is tracked separately (#117).
- Refusals are recorded as stats events (status `404`, cache `bypass`, no host, with the caller origin), so the dashboard shows who is being turned away.
- Adding a new first-party origin (a new domain, a native wrapper with its own scheme) is a config change plus redeploy of the public instance.
