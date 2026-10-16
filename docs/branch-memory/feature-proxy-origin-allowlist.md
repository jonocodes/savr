# feature/proxy-origin-allowlist
*Started: 2026-10-15 · Updated: 2026-10-15*

**What this branch did**
Restricted the shared public CORS proxy to allowlisted *calling sites* (via an optional `ALLOWED_ORIGINS` var) to stop other websites spending its free-tier quota through their visitors' browsers. Merged as #118 and deployed to `lively-cors-proxy-b569`; ADR 0006 records the decision.

**Decisions**
- Restrict callers (`Origin`), never targets — the proxy must keep fetching arbitrary public article hosts; that was a hard requirement from the user.
- Allowlist is savr.link + Netlify previews (`https://*--savrlist.netlify.app`, scheme found from preview-bot comments on past PRs) + `localhost:*` / `127.0.0.1:*`, and configurable via a plain wrangler var (origins aren't secret). User explicitly chose to cut off self-hosted frontends on their own domain; they must run their own proxy.
- Browser extension origins are deliberately **not** allowlisted — the extension never calls the proxy (it fetches pages/images itself with host permissions); its fallback runs in the savr.link app, so it carries the savr.link origin. User doesn't want extensions using the proxy.
- Missing/`null` Origin is refused — every app proxy call is `fetch()` (pages via `buildProxiedUrl`, images via `proxyImageSource`), which always sends Origin cross-origin, so nothing legitimate lacks it. Nothing loads the proxy through `<img src>`.
- Refusal reuses the token 404 (looks dead to scanners, keeps CORS headers per ADR 0001 so the client can still tell our worker from CF's edge) and is checked before the edge cache, mirroring the token check.
- Refusals *are* recorded in stats (404 / `bypass` / no host) so the dashboard shows who's being turned away; that combination distinguishes them from upstream 404s, which carry a host.
- `*` in a pattern matches `[a-z0-9-]+` and never a `.` — so the wildcard can't be stretched across domain labels.
- Unset = unchanged behaviour, so self-hosted proxies (token-locked) aren't affected; allowlist and token compose (both must pass).

**Rejected**
- Treating the Origin check as security — it isn't; `curl -H "Origin: https://savr.link"` passes. It only stops browser-based abuse from other sites.
- Turnstile-issued short-lived signed tokens — would actually stop scripts, but needs a minting endpoint and client change; parked as an alternative in #117.
- Referer-based fallback for requests without Origin — unnecessary since all app traffic is `fetch()`.

**Gotchas**
- Merging doesn't deploy: the public instance needs `npx wrangler deploy --env public` from `infra/cors-worker` (wrangler was already logged in on this machine).
- No `python3` on this machine — don't reach for it for scripted edits.
- `npx eslint infra/cors-worker` failed to load in a fresh worktree (deps not installed); `node --test` works without install.

**Open threads**
- #117: Cloudflare per-IP rate limiting for script abuse. Open question: rate-limit rules apply to zones, and the proxy runs on `*.workers.dev`, so it may need a custom domain; also whether blocked requests still count against the 100k/day Workers cap.
- Self-hosted Savr frontends using the default proxy now fail with 404s and the app doesn't explain why — #86 (proxy-exhausted messaging) could cover "this proxy refused your site" too.
- A real in-browser save on savr.link post-deploy wasn't done; only `curl` with forged Origins was verified against the live worker.
