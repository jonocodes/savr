# explore/browser-extension-cors
*Started: 2026-10-14 · Updated: 2026-10-14*

**What this branch did**
Built the optional browser extension (Firefox + Chrome) that saves the page you are already reading: toolbar popup (Save current page / Visit Savr / Settings), DOM scrape delivered through the app's existing bookmarklet ingest paths, YouTube transcript + thumbnail support, real app icons. Merged as PR #99 (`65ab8af`); issue #88 closed.

**Decisions**
- Scrape the loaded DOM instead of re-fetching the article — works behind logins/paywalls and needs no CORS proxy for the page. This is the extension's whole reason for existing.
- Deliver through the existing `?bookmarklet=` → `savr-html` and `?rawIngest=1` → `savr-raw` paths rather than a new protocol; the only app change needed was announcing `savr-ready` on the app's *own* window (the extension opens tabs via the tabs API, so there is no `window.opener`).
- MV3 with both `background.scripts` (Firefox event page, `type: module`) and `service_worker` (Chrome) declared, plus a `globalThis.browser ?? chrome` shim — Firefox does not support MV3 service workers (bug 1573659).
- Delivery bridge injects in the MAIN (page) world first with an isolated-world fallback. Page-world `postMessage` semantics match the bookmarklet's exactly; this fixed a real-Firefox stall (Chromium never showed it). MAIN support = Firefox 128+, which is the manifest's `strict_min_version` anyway.
- YouTube extraction is shared source (`browser-extension/youtube-transcript.js`): the background serializes the function into the watch tab, the Vite `?bookmarklet` plugin wraps the same function into the Preferences bookmarklet (the standalone bookmarklet file is gone). The extractor returns HTML so the video thumbnail rides along as an `<img>` — the app's normal image pipeline downloads it and picks it as the list thumbnail.
- Pending deliveries live in `storage.session` (plus an in-memory fast path) and are cleared only *after* injection, so an unloaded background resumes instead of dropping the save; a duplicate bridge after a crash is harmless (the app stops announcing once it ingests).
- Site handlers carry their own `isEnabled` (YouTube toggle in Settings, default on) instead of one global gate, so future extractors get their own switch for free.
- Preferences extension links are build-configurable (`VITE_FIREFOX_EXTENSION_URL` / `VITE_CHROME_EXTENSION_URL`, default = the extension README) — same gating pattern as telemetry and the failure-report dialog; empty hides a link.

**Rejected**
- Header-rewriting CORS (the old `firefox-cors/extension.ts` try) — MV3 dropped blocking `webRequest`, and it was Firefox-only anyway.
- Inlining image data-URLs into the scraped HTML up front — huge messages and it would fetch images Readability would drop; the per-image provider seam planned in #89 is the better shape.
- Keeping the transcript bookmarklet as the canonical source — the extension would have needed a second copy; now the extension owns the extractor and the app derives the bookmarklet.
- Calling it a "Firefox extension" in docs — the same MV3 code runs in Chrome (the e2e proves it); docs now say Firefox and Chrome.
- A Chrome "installer bundle" link — no self-hosted `.crx` install path exists; Web Store only (noted in #100).

**Gotchas**
- Playwright cannot install extensions into Firefox: the e2e loads the real extension into Chromium (`extension-save.spec.ts`) and Firefox packaging is checked with `web-ext lint` — real-Firefox behaviour is verified manually.
- The app only renders ingest status when `ingestPercent > 0`, so a save waiting for a payload looks exactly like the plain "Add Article" dialog — this masked the Firefox delivery failure at a glance.
- e2e must run inside `flox activate` (browsers come from flox's `PLAYWRIGHT_BROWSERS_PATH`; the home-manager one has mismatched browser revisions).
- Extension pages block `new Function`/eval via CSP — test setup must go through Playwright's `evaluate`, not eval'd strings.
- `web-ext lint`'s two warnings are expected: the Chrome-only `service_worker` key, and AMO's `data_collection_permissions` declaration (only matters at submission, see #100).
- Firefox action popups close on blur — the save must run in the background; that is why the popup only kicks it off.

**Open threads**
- #89 — extension-supplied images + logging each download's source (`extension <version>` / proxy hostname / direct); this is the actual "no CORS proxy" payoff, via a provider seam in the ingestion pipeline.
- #90 — v2 progress UX: background app tab, badge/notification, stay on the article.
- #100 — signed-XPI distribution exploration (AMO listed vs unlisted self-hosted; update story; AMO blockers).
- The YouTube article's thumbnail only lands once images download (proxy today; extension after #89).
