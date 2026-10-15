# Savr browser extension

An optional extension for Firefox and Chrome that saves the page you are already reading.

Instead of re-downloading the article through a CORS proxy, **Save current page**
scrapes the loaded DOM out of the tab: it works behind logins and paywalls, needs
no proxy request for the page, and produces the same reader view as a bookmarklet
save. (Article images are still fetched by the app through its usual path in
this version.)

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

### Firefox (desktop and Android)

Open **https://savr.link/extension/firefox.xpi** in Firefox (the app's
Preferences screen links to it). Firefox asks to allow savr.link to install an
add-on, then shows the permission prompt. It needs Firefox 142 or newer, and
updates itself (see [Updates](#updates)).

On Android it installs the same way; the toolbar button lives in the browser
menu under **Extensions**. **Visit Savr** switches to an open Savr tab (Android
has no windows to focus). Android support has not been verified on a device yet.

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
  redirect (`public/_redirects`) to the newest release asset, so the link the
  app shows never changes. The asset is uploaded as
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
**Load unpacked**. The Preferences link (`VITE_CHROME_EXTENSION_URL`) points at
this README until a listing exists.

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
- The extension on Firefox for Android: save, YouTube transcript, Visit Savr.
- A Chrome Web Store upload accepts the manifest's dual `background` keys.

## Settings

**Settings** in the popup opens the options page (also reachable from the
browser's extension manager: right-click the toolbar button → **Manage
Extension** → **Options** in Firefox, or the details page in Chrome).

The Savr address defaults to the hosted app (`https://savr.link`). Point it at
your own instance if you self-host — for example `http://localhost:3000`.
Custom addresses need a one-time host-permission grant, which the options page
requests when you save them; the hosted app and `localhost` are covered out of
the box.

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
- Validate with `npx web-ext@10 lint --self-hosted --source-dir=browser-extension`
  (`--self-hosted` because the manifest has an `update_url`; CI runs the same).
- Icons come from the app: `public/favicon-16x16.png` and `favicon-32x32.png`
  are used as-is, and 48/96/128 are resized from `public/icon.png`.

### Tests

- `tests/e2e/extension-save.spec.ts` — loads the real extension in Chromium and
  saves a fixture page end to end, plus the YouTube extractor against fixture
  DOMs (modern and legacy segment markup, panel opening, no-transcript).
- `tests/e2e/extension-delivery.spec.ts` — pins the app-side delivery contract
  (the `savr-ready` announcement and `savr-html` ingest) that this extension
  depends on.
