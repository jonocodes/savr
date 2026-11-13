# Savr browser extension

An optional extension for Firefox and Chrome that saves the page you are already reading.

Instead of re-downloading the article through a CORS proxy, **Save current page**
scrapes the loaded DOM out of the tab: it works behind logins and paywalls, needs
no proxy request for the page, and produces the same reader view as a bookmarklet
save. Article images are downloaded by the extension as well, so an extension
save makes no proxy request at all; an image the extension cannot fetch falls
back to the app's proxy (or a placeholder) without failing the save.

With the extension installed, **saves you start inside Savr** (typing a URL
into Add Article, or Refetch) also go through it: the extension downloads the
page and its images instead of the CORS proxy, so they work with no proxy
configured. See [Saves typed into the app](#saves-typed-into-the-app).

**YouTube watch pages** are special-cased: the transcript is extracted (opening
the panel if needed) and delivered as raw content, exactly like the YouTube
transcript bookmarklet — including the video thumbnail, which the app downloads
like any article image. A video without a transcript falls back to the normal
page scrape. This is on by default; **Extension settings → On YouTube, fetch the
transcript instead of the page** turns it off.

Clicking the toolbar button saves the current page. Right-clicking it adds
these entries to the button's menu:

- **Save current page** — scrapes the active tab and hands it to Savr.
- **Visit Savr** — focuses an open Savr tab, or opens one.
- **Extension settings** — opens the options page (see [Settings](#settings)).

With no popup to report back to, the button's badge shows `…` while a save
runs (a YouTube transcript can take a few seconds) and `!` for a few seconds
when it fails; hover the button to read the error. A successful save shows no
badge, because the Savr tab it opens is the feedback.

Prefer the old behaviour? **Extension settings → When I click the Savr button
→ Show the menu** makes a click open a small popup with the same three entries
(see [Settings](#settings)).

Firefox for Android has no right-click menu on extension buttons, so there the
button always opens the popup and the setting is hidden. The manifest declares
that popup (`default_popup`), and where context menus exist the background
clears it on every start unless the setting asks for the menu, and reapplies
it whenever the setting changes. Until the background has run after a browser
start, a desktop click may still open the popup.

There is deliberately no page context-menu entry.

## Install

### Firefox (desktop and Android)

Open the [extension releases](https://github.com/jonocodes/savr/releases?q=extension&expanded=true) in
Firefox (the app's Preferences screen links there) and click the
`savr-firefox-<version>.xpi` asset of the newest one. Firefox asks to allow github.com to install an
add-on, then shows the permission prompt. It needs Firefox 142 or newer, and
updates itself (see [Updates](#updates)).

On Android, tapping the `.xpi` only downloads it — Firefox for Android
does not install add-ons from a web link outside addons.mozilla.org. Install
the downloaded file instead
([Mozilla's instructions](https://extensionworkshop.com/documentation/publish/install-self-distributed/)):

1. Open **Settings → About Firefox** and tap the Firefox logo five times
   quickly to unlock the hidden menu items.
2. Back in **Settings**, choose **Install Extension from File** and pick the
   downloaded `.xpi`.
3. Tap **Add** at the permission prompt.

The toolbar button then lives in the browser menu under **Extensions**.
**Visit Savr** switches to an open Savr tab (Android has no windows to focus).
Android support has not been verified on a device yet, including whether it
picks up updates from `update_url`.

For development, load the source as a temporary add-on instead: open
`about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on…**, and
select `browser-extension/manifest.json`. Temporary add-ons are removed when
Firefox restarts.

### Chrome (and other Chromium browsers)

There is no store listing yet, so Chrome installs by sideloading: download
`savr-chromium-<version>.zip` from the newest `ext-v*`
[release](https://github.com/jonocodes/savr/releases) (or use this directory),
unzip it, open `chrome://extensions`, enable **Developer mode**, and use
**Load unpacked**. Sideloaded extensions do not update. The automated test
suite (`tests/e2e/extension-save.spec.ts`) loads this exact code into Chromium
and runs a real save, so this path stays exercised.

## Distribution

Decided in [#100](https://github.com/jonocodes/savr/issues/100); the evidence,
with sources, is in
[docs/extension-distribution-research.md](../docs/extension-distribution-research.md).

**Firefox: signed unlisted on addons.mozilla.org (AMO), self-hosted.** AMO signs
the add-on (automated review, no public listing) and we host the `.xpi` on
GitHub Releases. Chosen over a public AMO listing for less friction: no listing
metadata, screenshots or human review queue, and releases are under our
control. The cost is running our own update manifest. Moving to a listing later
is a documented path: ship one last self-hosted version **without**
`update_url`, and Firefox switches those installs to AMO for updates.

- **Install link.** `https://savr.link/extension/firefox.xpi` is a Netlify
  redirect (`public/_redirects`) to the newest release asset, so that link
  never changes. Preferences links to the GitHub release list instead: clicked
  from the app, Firefox blocked the install through the redirect. The asset is uploaded as
  `Content-Type: application/x-xpinstall`, which is what makes Firefox start
  its install flow instead of downloading the file. Any site other than AMO
  gets Firefox's "Allow *site* to install an add-on?" prompt first; that is
  unavoidable when self-hosting.
- **Updates.** The manifest's `update_url` is
  `https://savr.link/extension/updates.json` (`public/extension/updates.json`).
  It is on savr.link rather than GitHub because installed copies keep the
  `update_url` they were installed with forever; the domain lets us move the
  files without stranding anyone. Firefox checks it daily. Unlisted versions
  get no updates from AMO, and installs made without an `update_url` can never
  learn one, which is why it ships in the very first signed version.
- **Data collection.** The manifest declares
  `data_collection_permissions.required: ["websiteContent", "browsingActivity"]`:
  the extension's job is to hand the page HTML and URL to Savr, which syncs it
  to your storage. Declaring it (rather than `none`) keeps us honest if a
  reviewer looks. The key needs Firefox 140 (desktop) / 142 (Android), hence
  `strict_min_version: 142.0`.

**Chrome: not self-hostable.** Google Chrome on Windows and macOS disables
extensions installed from outside the Chrome Web Store (only enterprise policy
can override it), so a hosted `.crx` would not work for most people. The plan
is an **unlisted** Chrome Web Store item (a one-time developer registration fee;
review takes days); Edge, Brave and Vivaldi can install from it too, and Edge
Add-ons is a free alternative. Until then, the release's Chromium zip is for
**Load unpacked**. The Preferences screen shows no Chrome link
(`VITE_CHROME_EXTENSION_URL` defaults to empty) until a listing exists.

### Versioning

The extension is versioned independently of the app: semver in
`manifest.json`, released by `ext-v<version>` tags. AMO accepts each version
number exactly once (even after deletion), so every release needs a bump.

The app and the extension also update on different schedules (savr.link
deploys continuously, extensions update daily, self-hosted Savr instances can
lag far behind), so the contract between them is versioned separately: every
payload the bridge delivers carries `protocol: 1` (`BRIDGE_PROTOCOL` in
`background.js`). Bump it only for a breaking change to the payload; the app
treats a payload without it as protocol 1.

### Releasing

One-time setup:

1. Create AMO API credentials at
   https://addons.mozilla.org/en-US/developers/addon/api/key/ and save them as
   the repository secrets `WEB_EXT_API_KEY` (JWT issuer) and
   `WEB_EXT_API_SECRET` (JWT secret).
2. Optional: enable **Settings → Actions → General → Allow GitHub Actions to
   create and approve pull requests**, so the workflow can open the publish PR
   itself. Without it, the workflow pushes the branch and you open the PR.

Each release:

1. Bump `version` in `manifest.json` and merge it to `main`.
2. Tag and push: `git tag ext-v1.2.3 && git push origin ext-v1.2.3`.
3. The **Extension release** workflow (`.github/workflows/extension-release.yml`)
   checks the tag matches the manifest, lints with AMO's unlisted rules
   (`web-ext lint --self-hosted`), signs on AMO (`web-ext sign --channel
   unlisted`), creates the `ext-v1.2.3` GitHub release (never marked "latest",
   which belongs to the app) with the signed XPI and a Chromium zip, verifies
   the XPI's content type, and opens a **Publish browser extension 1.2.3** PR.
4. Merge that PR. It adds the version to `updates.json` and points the install
   link at it; once savr.link redeploys, new installs get it immediately and
   existing ones within a day.

The PR updates are done by `scripts/extension-release.mjs` (tested by
`scripts/extension-release.test.mjs`, which CI runs along with
`web-ext lint`). To check a build locally:
`npx web-ext@10 lint --self-hosted --source-dir browser-extension`.

If signing times out (AMO allows up to 24 hours), the version is already used
up on AMO: download the signed file from the AMO Developer Hub when it is
approved, attach it to the release by hand with
`Content-Type: application/x-xpinstall`, and run
`node scripts/extension-release.mjs publish --xpi <file> --link <asset url>`.

### Not yet verified

These need a manual check on the first release:

- Release Firefox installs from `savr.link/extension/firefox.xpi` (through the
  Netlify and GitHub redirects) with only the two prompts.
- An installed copy picks up the next version from `updates.json`.
- The extension on Firefox for Android: install from file, save, YouTube
  transcript, Visit Savr, and updates from `updates.json`.
- A Chrome Web Store upload accepts the manifest's dual `background` keys.
- Click-to-save and the right-click menu on desktop Firefox (the e2e suite
  covers Chromium only), and that Firefox for Android still gets the popup.

## Settings

**Extension settings** in the toolbar button's right-click menu (or the popup
on Android) opens the options page. It is also reachable from the browser's
extension manager: right-click the toolbar button → **Manage Extension** →
**Options** in Firefox, or the details page in Chrome.

**When I click the Savr button** (desktop only) picks what a left click does:
**Save the current page** (the default) or **Show the menu** (the popup).
Right-clicking the button shows the menu either way. The change applies as
soon as you save it.

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
   `{action: "savr-raw", content, contentType, title, author, url}`, plus
   `source: "extension"` and `protocol` (see [Versioning](#versioning)).
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

When the [app bridge](#saves-typed-into-the-app) is already in the tab, the
relay is not injected: the bridge forwards image requests itself, so each
image is fetched once.

Every download is logged in the article's `fetch.log` and the app's
Diagnostics log with the downloader that delivered it — `extension 0.1.0`,
`proxy <hostname>` or `direct` — and the full fallback chain, e.g.
`extension 0.1.0 failed (HTTP 404) -> direct failed (...)`.

### Saves typed into the app

A URL typed into Add Article (or an article's Refetch) has no delivery to
carry the handshake, and no tab for the extension to scrape — the app has to
download the page itself. Without a proxy that is a cross-origin fetch most
sites block. The app bridge lets the extension do that download instead:

1. The background registers `app-bridge.js` as a content script on the
   configured Savr address (`scripting.registerContentScripts`, id
   `savr-app-bridge`, `document_start`), re-checks it on every background
   start and whenever the address changes, and injects it into Savr tabs that
   were already open. Match patterns cannot carry a port, so it covers every
   port on that host; the script itself only answers on the exact Savr origin.
2. When the Add Article dialog opens (and before Refetch), the app posts
   `{action: "savr-extension-ping", id}`; the bridge answers
   `{action: "savr-extension-pong", id, source: "extension", extensionVersion}`
   straight from the content script, without waking the background. No answer
   within 750 ms means no extension (or one older than 0.1.5), and the app
   behaves exactly as before.
3. For the save the app posts `{action: "savr-page-request", id, url}`. The
   background downloads it with its host permissions — CORS-exempt, **no
   cookies**, http(s) only, 25 MB cap, 15 s timeout, and only for the
   configured Savr address — and the bridge posts back
   `{action: "savr-page-response", id, ok, contentType, base64}` (or
   `{ok: false, error}`). The app rebuilds a `Response` from it, so HTML,
   text, PDFs and images ingest exactly as they do through a proxy. Images
   then go through the bridge too (`savr-image-request`, as above).
4. Anything the extension cannot supply — no host permission, an error status,
   a timeout — falls back to the proxy (or a direct fetch), and the chain is
   logged: `article downloaded via direct: <url> (extension 0.1.5 failed (HTTP
   403) -> direct ok)`.

This is the same anonymous fetch a CORS proxy makes, not a logged-in one;
**Save current page** is still the way to capture what you can see behind a
login. Like the image relay, it lets any script running on the Savr origin
fetch public pages through your browser, which is what the app's own proxy
requests already allow.

## Permissions

| Permission        | Why                                                             |
| ----------------- | --------------------------------------------------------------- |
| `activeTab`       | Scrape the page whose toolbar button was clicked.               |
| `contextMenus`    | The toolbar button's right-click menu (no install prompt).      |
| `scripting`       | Inject the scraper into that page and the bridges into the app; register the app bridge on the Savr address. |
| `storage`         | Remember the Savr address and the pending save across unloads.  |
| host: `localhost` | Talk to the app and inject the bridge when you self-host/dev.   |
| host: `savr.link` | Same, for the hosted app.                                       |
| host: all sites   | Download articles and images for the app (CORS-exempt, so no proxy), and reach a custom Savr address. |

## Development

- `manifest.json` is Firefox-first Manifest V3: the background is an event page
  (`background.scripts`); `background.service_worker` is declared alongside it so
  Chrome (121+) uses the same file as a service worker. Firefox does not support
  service workers for MV3 extensions.
- The background and injected functions are plain self-contained scripts — no
  build step. After editing, reload the temporary add-on in `about:debugging`
  (or the unpacked extension in Chrome).
- Validate with `npx web-ext@10 lint --self-hosted --source-dir=browser-extension`
  (`--self-hosted` because the manifest has an `update_url`; CI runs the same).
- Icons come from the app: `public/favicon-16x16.png` and `favicon-32x32.png`
  are used as-is, and 48/96/128 are resized from `public/icon.png`.
- Strings are localised through the standard WebExtension mechanism:
  `_locales/en/messages.json` is the `default_locale`, `_locales/es/…` carries
  Spanish, and the manifest resolves `__MSG_*__` names. HTML uses
  `data-i18n` / `data-i18n-html` attributes (resolved at load), scripts call
  `api.i18n.getMessage(...)`. The extension follows the browser's language —
  there is no separate switch in the extension. Add every new key to both
  locale files.

### Tests

- `tests/e2e/extension-save.spec.ts` — checks a toolbar click is wired to save
  (the popup is cleared) and that the click setting switches it to the menu,
  loads the real extension in Chromium and
  saves a fixture page end to end, including an article whose images come
  through the extension (and a 404 that falls back), a URL typed into the
  app's Add Article dialog with no proxy (the app bridge registers, stays
  silent on another port of the same host, and the page downloads through
  the extension), plus the YouTube
  extractor against fixture DOMs (modern and legacy segment markup, panel
  opening, no-transcript).
- `tests/e2e/extension-delivery.spec.ts` — pins the app-side delivery contract
  (the `savr-ready` announcement and `savr-html` ingest) that this extension
  depends on, plus the image bridge with a simulated relay: zero app-side
  image requests for supplied images, and the downloader in both logs.
