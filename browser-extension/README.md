# Savr browser extension

An optional Firefox extension that saves the page you are already reading.

Instead of re-downloading the article through a CORS proxy, **Save current page**
scrapes the loaded DOM out of the tab: it works behind logins and paywalls, needs
no proxy request for the page, and produces the same reader view as a bookmarklet
save. (Article images are still fetched by the app through its usual path in
this version.)

The toolbar button opens a small popup:

- **Save current page** — scrapes the active tab and hands it to Savr.
- **Visit Savr** — focuses an open Savr tab, or opens one.

There is deliberately no page context-menu entry.

## Install (Firefox)

The extension is not published to addons.mozilla.org yet; load it as a temporary
add-on:

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…**.
3. Select `browser-extension/manifest.json`.

Temporary add-ons are removed when Firefox restarts. (Signing and AMO publishing
are a follow-up.)

### Chrome (for development)

The same MV3 code runs in Chrome: open `chrome://extensions`, enable
**Developer mode**, and use **Load unpacked** on this directory. This is used by
the automated test suite (`tests/e2e/extension-save.spec.ts`), which loads the
extension and runs a real save.

## Settings

The Savr address defaults to the hosted app (`https://savr.link`) and is
configurable on the extension's options page (right-click the toolbar button →
**Manage Extension** → **Options**). Point it at your own instance if you
self-host — for example `http://localhost:3000`. Chrome's equivalent opens the
options inline from the extension's details page.

Custom addresses need a one-time host-permission grant, which the options page
requests when you save them. The hosted app and `localhost` are covered out of
the box.

## How it works

The extension reuses the app's bookmarklet ingest path, minus the opener:

1. The background scrapes the active tab (`document.documentElement` clone with
   `<script>` tags and inline event handlers removed) and opens a Savr tab at
   `/?bookmarklet=<page url>`.
2. The app announces `savr-ready` on its own window until a payload arrives.
3. The background injects a small bridge into the Savr tab once it finishes
   loading; the bridge waits for the announce and replies once with
   `{action: "savr-html", url, html}`.
4. The app runs its normal ingest (Readability, images, sync) and shows the same
   progress dialog a bookmarklet save does.

The pending payload is kept in `storage.session` (with an in-memory fast path)
and is cleared only after the bridge is injected, so the flow survives the
background being unloaded mid-save (Chrome service workers especially).

## Permissions

| Permission        | Why                                                             |
| ----------------- | --------------------------------------------------------------- |
| `activeTab`       | Scrape the page whose toolbar button was clicked.               |
| `scripting`       | Inject the scraper into that page and the bridge into the app.  |
| `storage`         | Remember the Savr address and the pending save across unloads.  |
| host: `localhost` | Talk to the app and inject the bridge when you self-host/dev.   |
| host: `savr.link` | Same, for the hosted app.                                       |
| optional hosts    | Only when you point the extension at a custom address.          |

## Development

- `manifest.json` is Firefox-first Manifest V3: the background is an event page
  (`background.scripts`); `background.service_worker` is declared alongside it so
  Chrome (121+) uses the same file as a service worker. Firefox does not support
  service workers for MV3 extensions.
- The background and injected functions are plain self-contained scripts — no
  build step. After editing, reload the temporary add-on in `about:debugging`
  (or the unpacked extension in Chrome).
- Validate with `npx web-ext lint --source-dir=browser-extension`.

### Tests

- `tests/e2e/extension-save.spec.ts` — loads the real extension in Chromium and
  saves a fixture page end to end.
- `tests/e2e/extension-delivery.spec.ts` — pins the app-side delivery contract
  (the `savr-ready` announcement and `savr-html` ingest) that this extension
  depends on.
