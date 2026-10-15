# implement/89
*Started: 2026-10-14 · Updated: 2026-10-15*

**What this branch did**
Extension-initiated saves download their article images through the browser extension (CORS-exempt background fetch), so an extension user needs no proxy; every article/image download now logs its downloader. Merged as PR #104 (`2864a81`), closing #89. Follow-ups on separate branches: #107 counts extension saves separately in GoatCounter (`capture-extension`), #113 renamed the `-raw` capture events to `-extracted`.

**Decisions**
- The handshake is the existing delivery: the extension's `savr-html`/`savr-raw` reply to `savr-ready` carries `extensionVersion`; no separate hello round-trip. The background adds the version **only after the image relay injected**, so "version present" means "image bridge available" and older extensions or a failed relay fall back to the proxy with no timeouts.
- The relay runs in the app tab's **isolated** world (needs `runtime.sendMessage`); the payload bridge stays in MAIN. Bytes travel as base64 data URLs because Chrome runtime messaging is JSON-only.
- Timeouts are ordered on purpose: background fetch 10 s < app per-request 15 s. An app-side timeout therefore means "relay gone", and the image source then fails the rest of that save fast. (The first cut had them reversed — one slow image disabled the extension for the whole save; caught in review.)
- The handshake only counts if posted on the app's own window (`event.origin`/`event.source` check), so a bookmarklet payload from another origin can't claim to be the extension.
- `*://*/*` moved from optional to **required** `host_permissions`: background fetches are only CORS-exempt for granted hosts. Accepted cost: Chrome's "read and change all your data" warning and re-approval for existing sideloads.
- Downloader labels: `extension <version>`, `proxy <hostname>` (hostname only — path/query/credentials can hold the token), `direct`; the attempt chain is joined as `a failed (err) -> b ok`. The article page download in `ingestUrl` is logged too (`fetchLogPrelude`), since "every file download" includes it.
- Telemetry names use "extracted", not "raw": "raw" is a protocol term. Protocol/stored names (`savr-raw`, `?rawIngest=1`, `ingestRaw`, `ingestSource: "raw"`) were deliberately **not** renamed — they'd break saved articles and older bookmarklets/extensions.

**Rejected**
- A separate hello/version message before delivery — the delivery already is the reply to the app's announcement; an extra round trip adds failure modes for nothing.
- Keeping the per-image extension source alive after a timeout — with sequential image downloads, a dead relay would cost 15 s per image.
- Blocking private/localhost image URLs in the background — would break the e2e content server and self-hosted images (see open threads).
- Renaming telemetry to `capture-extension-youtube` — too specific once other extractors exist; `-extracted` describes the outcome.

**Gotchas**
- E2E in this environment: the paseo session's `LD_LIBRARY_PATH` (newer alsa-lib) breaks the flox Chromium (`GLIBC_ABI_GNU2_TLS not found`). Run `env -u LD_LIBRARY_PATH flox activate -c "node scripts/run-e2e.js ..."`.
- Successful image downloads end in a canvas resize, which Node/jest can't run (jsdom's `Image` never fires `onload`). Unit-test the success path at `downloadImage`, and only failure chains through `ingestHtml`; the e2e specs cover success.
- Jest's global `setup.js` mocks `~/utils/article/tools` wholesale — a test file that exercises the image-failure path must include `FetchError` in its own mock, or `instanceof FetchError` throws.
- Adding an e2e test reshuffles worker → storage-user assignment; `multi-browser-archive-sync` broke on articles other specs left behind until it called `clearAllArticles` first. Specs sharing a worker's storage user must clean up front.
- No repo prettier config: running prettier on a spec rewraps unrelated lines (80 cols, trailing commas) and can push an `any` off its `eslint-disable-next-line` (CI lint failure on #104).

**Open threads**
- Permission scope: an opt-in "download images through the extension" toggle that requests `*://*/*` from the options page would avoid the install-time warning (relevant to Chrome Web Store review, #106).
- The relay is an SSRF-ish capability: for ~10 min after a save, script on the Savr origin can make the extension fetch http(s) URLs (incl. intranet/localhost) CORS-exempt. Accepted for now; revisit before store listing.
- Extension version still `1.0.0` despite the new capability.
- GoatCounter history for the old `capture-raw` stays under that name; new counts are `capture-bookmarklet-extracted`.
- Firefox users can revoke the all-sites grant; the extension then silently falls back to the proxy and nothing tells the user.
