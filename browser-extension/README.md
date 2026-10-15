# Savr browser extension

An optional extension for Firefox and Chrome that saves the page you are already reading.

Instead of re-downloading the article through a CORS proxy, **Save current page**
scrapes the loaded DOM out of the tab: it works behind logins and paywalls, needs
no proxy request for the page, and produces the same reader view as a bookmarklet
save. Article images are downloaded by the extension as well, so an extension
save makes no proxy request at all; an image the extension cannot fetch falls
back to the app's proxy (or a placeholder) without failing the save.

**YouTube watch pages** are special-cased: the transcript is extracted (opening
the panel if needed) and delivered as raw content, exactly like the YouTube
transcript bookmarklet — including the video thumbnail, which the app downloads
like any article image. A video without a transcript falls back to the normal
page scrape. This is on by default; **Settings → On YouTube, fetch the
transcript instead of the page** turns it off.

The toolbar button opens a small popup:

- **Save current page** — scrapes the active tab and hands it to Savr.
- **Visit Savr** — focuses an open Savr tab, or opens one.

There is deliberately no page context-menu entry.

## Install

The extension is not published to addons.mozilla.org or the Chrome Web Store
yet, so both browsers install it by sideloading. Store listings are a follow-up.

### Firefox

Load it as a temporary add-on:

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…**.
3. Select `browser-extension/manifest.json`.

Temporary add-ons are removed when Firefox restarts.

### Chrome (and other Chromium browsers)

Open `chrome://extensions`, enable **Developer mode**, and use **Load unpacked**
on this directory. The automated test suite (`tests/e2e/extension-save.spec.ts`)
loads this exact code into Chromium and runs a real save, so this path stays
exercised.

## Distribution

Sideloading (above) is the only install path today. The plan:

- **Firefox**: publish to addons.mozilla.org, or sign an unlisted build
  (`npx web-ext sign --channel unlisted`) and host the signed `.xpi` yourself
  (e.g. a GitHub release) — Firefox installs it from a direct link with a
  permission prompt. AMO submission also needs the `data_collection_permissions`
  manifest declaration that `web-ext lint` currently warns about.
- **Chrome**: the Chrome Web Store is the only install path for normal users
  (self-hosted `.crx` files are blocked); a repo zip only works through
  **Load unpacked**.

The app's Preferences screen links to these targets next to the bookmarklets;
the URLs are build-time configurable (`VITE_FIREFOX_EXTENSION_URL`,
`VITE_CHROME_EXTENSION_URL`) and default to this README.

## Settings

**Settings** in the popup opens the options page (also reachable from the
browser's extension manager: right-click the toolbar button → **Manage
Extension** → **Options** in Firefox, or the details page in Chrome).

The Savr address defaults to the hosted app (`https://savr.link`). Point it at
your own instance if you self-host — for example `http://localhost:3000`.
Any address is covered by the all-sites host permission granted at install;
if you have revoked it (Firefox lets you), the options page asks for access to
a custom address when you save it.

The options page also links to the project on GitHub
([jonocodes/savr](https://github.com/jonocodes/savr)).

## How it works

The extension reuses the app's bookmarklet ingest paths, minus the opener:

1. A site-specific extractor runs first when one matches — today only YouTube
   watch pages, which share their extraction with the transcript bookmarklet
   (`youtube-transcript.js`). A successful extraction opens the app at
   `/?rawIngest=1`.
2. Otherwise the background scrapes the active tab
   (`document.documentElement` clone with `<script>` tags and inline event
   handlers removed) and opens a Savr tab at `/?bookmarklet=<page url>`.
3. The app announces `savr-ready` on its own window until a payload arrives.
4. The background injects a small bridge into the Savr tab once it finishes
   loading; the bridge waits for the announce and replies once with the
   payload — `{action: "savr-html", url, html}` or
   `{action: "savr-raw", content, contentType, title, author, url}`.
5. The app runs its normal ingest (Readability for `savr-html`, verbatim
   storage for `savr-raw`) and shows the same progress dialog a bookmarklet
   save does.

The pending payload is kept in `storage.session` (with an in-memory fast path)
and is cleared only after the bridge is injected, so the flow survives the
background being unloaded mid-save (Chrome service workers especially).

### Images

The delivered payload doubles as a handshake: it carries `source: "extension"`
and `extensionVersion`, which the app takes as "the image bridge is here".

1. Before the delivery bridge, the background injects a small relay into the
   Savr tab's isolated world (it needs `runtime.sendMessage`). The version is
   only added to the payload when the relay is in place, so a failed relay
   injection just means the app uses its proxy as before.
2. For each image the app posts `{action: "savr-image-request", id, url}` on
   its own window. The relay forwards it to the background, which fetches the
   image with its host permissions (CORS-exempt, cookies omitted, http(s)
   only, image content types only, 25 MB cap) and only for requests coming
   from the configured Savr address.
3. The relay posts back `{action: "savr-image-response", id, ok, dataUrl}` (or
   `{ok: false, error}`). The app matches replies by id with a 15 s timeout (the background gives up on a slow image after 10 s, so
   the app only times out when the relay itself is gone);
   after one timeout it stops asking for the rest of that save.
4. Any image the extension does not supply is fetched through the proxy (or
   directly) as usual, so a broken or slow extension never blocks a save.

Every download is logged in the article's `fetch.log` and the app's
Diagnostics log with the downloader that delivered it — `extension 1.0.0`,
`proxy <hostname>` or `direct` — and the full fallback chain, e.g.
`extension 1.0.0 failed (HTTP 404) -> direct failed (...)`.

## Permissions

| Permission        | Why                                                             |
| ----------------- | --------------------------------------------------------------- |
| `activeTab`       | Scrape the page whose toolbar button was clicked.               |
| `scripting`       | Inject the scraper into that page and the bridge into the app.  |
| `storage`         | Remember the Savr address and the pending save across unloads.  |
| host: `localhost` | Talk to the app and inject the bridge when you self-host/dev.   |
| host: `savr.link` | Same, for the hosted app.                                       |
| host: all sites   | Download article images for the app (CORS-exempt, so no proxy), and reach a custom Savr address. |

## Development

- `manifest.json` is Firefox-first Manifest V3: the background is an event page
  (`background.scripts`); `background.service_worker` is declared alongside it so
  Chrome (121+) uses the same file as a service worker. Firefox does not support
  service workers for MV3 extensions.
- The background and injected functions are plain self-contained scripts — no
  build step. After editing, reload the temporary add-on in `about:debugging`
  (or the unpacked extension in Chrome).
- Validate with `npx web-ext lint --source-dir=browser-extension`.
- Icons come from the app: `public/favicon-16x16.png` and `favicon-32x32.png`
  are used as-is, and 48/96/128 are resized from `public/icon.png`.

### Tests

- `tests/e2e/extension-save.spec.ts` — loads the real extension in Chromium and
  saves a fixture page end to end, including an article whose images come
  through the extension (and a 404 that falls back), plus the YouTube
  extractor against fixture DOMs (modern and legacy segment markup, panel
  opening, no-transcript).
- `tests/e2e/extension-delivery.spec.ts` — pins the app-side delivery contract
  (the `savr-ready` announcement and `savr-html` ingest) that this extension
  depends on, plus the image bridge with a simulated relay: zero app-side
  image requests for supplied images, and the downloader in both logs.
