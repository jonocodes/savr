# Browser extension distribution: research notes (issue #100)

Researched 2026-10-15 for `browser-extension/` (MV3, gecko id `savr@jonocodes.github.io`,
`strict_min_version` 128.0, no build step, no `update_url`). Sources are primary only:
Extension Workshop, MDN, the AMO server source (`mozilla/addons-server`), the
`mozilla/addons-linter` and `mozilla/web-ext` repos, Firefox source (`mozilla-firefox/firefox`
on GitHub, `main`), developer.chrome.com, Chromium source, and Microsoft/Vivaldi/Brave docs.
Where I ran something locally, the command and output are described. "Source code" claims cite
the file on its default branch as of this date, so they can change without notice.

## TL;DR

**Corrections to our working assumptions**

| Assumption | Verdict |
|---|---|
| Unlisted needs `update_url` for auto-updates | **True.** Without `update_url`, Firefox asks AMO's update service, and that only returns **listed** versions. |
| GitHub release links won't one-click install | **Mostly false.** A GitHub release asset is served with whatever `Content-Type` was set at upload. Popular projects' `.xpi` assets come back as `application/x-xpinstall` (checked with `curl`), which starts Firefox's install flow. You still get the third-party "Allow *host* to install an add-on?" prompt, as with any non-AMO site. |
| `data_collection_permissions` is required for all new submissions and needs FF 140+ | **Partly true.** AMO only *blocks* new add-ons uploaded through the **Developer Hub web UI**. Uploads through the API (`web-ext sign`) only get a **warning**, because the server code checks the upload source. The key works on Firefox 140+ desktop and 142+ Android. With a lower `strict_min_version` the linter only **warns**, it doesn't error. Mozilla's stated plan is to require it everywhere "in the first half of 2026", but the Add-ons blog has posted no follow-up. Add the key anyway. |
| Chrome can't self-host a `.crx` for consumers | **True on Windows and macOS** for Google Chrome. Off-store packed extensions are disabled unless force-installed by policy on a managed machine. **Linux is the exception.** Chromium builds without Google branding don't run the install verifier at all. |

**Firefox recommendation (self-hosted, signed, unlisted)**

1. Manifest changes. Add these to `browser_specific_settings`, keeping `id`:
   ```json
   "browser_specific_settings": {
     "gecko": {
       "id": "savr@jonocodes.github.io",
       "strict_min_version": "140.0",
       "update_url": "https://savr.link/extension/updates.json",
       "data_collection_permissions": { "required": ["websiteContent", "browsingActivity"] }
     },
     "gecko_android": { "strict_min_version": "142.0" }
   }
   ```
   - Raise `strict_min_version` to 140 (and 142 for Android). Below that, declaring
     `data_collection_permissions` gives `KEY_FIREFOX_*_UNSUPPORTED_BY_MIN_VERSION` lint warnings.
     Policy also requires a custom consent UI for Firefox ≤139 if you transmit data
     (see [Q3](#3-data_collection_permissions)). ESR 128 is no longer on Mozilla's ESR schedule.
   - Ship `update_url` **from the very first signed release**. Installs made without it can never
     discover it later.
   - Choosing between `websiteContent`/`browsingActivity` and `none` is a judgement call
     (reasoning in [Q3](#3-data_collection_permissions)). I recommend declaring the two data
     types: the extension's whole job is to hand page HTML + URL to code that syncs it off the device.
2. Sign the add-on:
   `npx web-ext@10 sign --channel=unlisted --source-dir=browser-extension --api-key=$WEB_EXT_API_KEY --api-secret=$WEB_EXT_API_SECRET`
   (credentials come from https://addons.mozilla.org/en-US/developers/addon/api/key/). You need a
   new, never-used `version` for every submission.
3. Host the XPI. Two options:
   - **GitHub Release asset** uploaded as `application/x-xpinstall`. Check it with
     `gh api repos/jonocodes/savr/releases/latest --jq '.assets[]|.name+" "+.content_type'`.
     A stable link is `https://github.com/jonocodes/savr/releases/latest/download/savr-firefox.xpi`.
   - **savr.link (Netlify)**, with a `_headers` rule setting `Content-Type: application/x-xpinstall`
     for `/extension/*.xpi`.
4. Host `https://savr.link/extension/updates.json` (Netlify `public/extension/updates.json`):
   ```json
   { "addons": { "savr@jonocodes.github.io": { "updates": [
     { "version": "1.1.0",
       "update_link": "https://github.com/jonocodes/savr/releases/download/ext-v1.1.0/savr-firefox-1.1.0.xpi",
       "update_hash": "sha256:<hex>",
       "applications": { "gecko": { "strict_min_version": "140.0" } } }
   ] } } }
   ```
   The key is `applications`, **not** `browser_specific_settings`. Firefox's update parser only
   reads `applications`.
5. Moving to an AMO listing later is a documented path. Publish one final self-hosted version
   **without** `update_url`. Firefox then checks AMO for listed updates.

**Chrome recommendation:** publish to the **Chrome Web Store as "Unlisted"**. It costs a one-time
developer registration fee (reported as $5 in 2020), and review usually takes "a few days" but can
take "up to a few weeks". The same CWS link works in Brave, Vivaldi and Edge (Edge asks the user to
"Allow extensions from other stores"). Optionally also list it on Edge Add-ons, which has no fee.
Keep "Load unpacked" documented for developers and self-hosters. Don't offer a `.crx` download
except as a Linux-only nicety.

---

## 1. Unlisted XPI updates

**Without `update_url`, Firefox only picks up *listed* AMO versions.** The self-distribution docs say:
"If the extension includes an update_url in its manifest, Firefox installs any updates with a higher
version number available on that URL. If it doesn't include an update_url, Firefox checks AMO for a
listed update. If a listed update with a higher version number is available, Firefox distributes
that version to users who have installed the self-distributed file. Otherwise, you need to
distribute updates for your users to install."
([Extension Workshop: self-distribution](https://extensionworkshop.com/documentation/publish/self-distribution/))

The "default update URL" is the Firefox pref `extensions.update.url`, which is
`https://versioncheck.addons.mozilla.org/update/VersionCheck.php?...&id=%ITEM_ID%&version=%ITEM_VERSION%...`.
The check interval is `extensions.update.interval` = 86400 s (24 hours)
([firefox.js](https://github.com/mozilla-firefox/firefox/blob/main/browser/app/profile/firefox.js)).
On the AMO side that endpoint is `Updater` in
[`src/olympia/versions/update.py`](https://github.com/mozilla/addons-server/blob/master/src/olympia/versions/update.py).
It calls `Version.objects.latest_public_compatible_with()`, which filters on
`'channel': amo.CHANNEL_LISTED, 'file__status': amo.STATUS_APPROVED`
([`versions/models.py`](https://github.com/mozilla/addons-server/blob/master/src/olympia/versions/models.py)).
**So AMO's update service never serves unlisted versions.**

**Hosting and format requirements** ([Updating your extension](https://extensionworkshop.com/documentation/manage/updating-your-extension/)):
- "You must host your update manifest file on a secure (HTTPS) server." MDN repeats this for
  `update_url`: "the link must begin with 'https'"
  ([MDN browser_specific_settings](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings)).
- Structure: `addons.<id>.updates[]`, where each entry has `version` (required), plus optional
  `update_link`, `update_hash`, `update_info_url` and `applications`.
- `update_link`: "This must be an HTTPS URL, or an update_hash must be provided to verify it."
  `update_hash` must start with `sha256:` or `sha512:`. Firefox enforces this in
  `sanitizeUpdateURL`: a non-`https:` link without a matching hash is dropped while
  `AddonManager.checkUpdateSecurity` is on
  ([AddonUpdateChecker.sys.mjs](https://github.com/mozilla-firefox/firefox/blob/main/toolkit/mozapps/extensions/internal/AddonUpdateChecker.sys.mjs)).
  A hash is optional with HTTPS, but cheap to add.
- `applications.gecko.strict_min_version` (default 42.0a1), `strict_max_version`, and
  `advisory_max_version`. "If this property is defined, it must contain a gecko property, or the
  update entry is ignored." Firefox only reads the `applications` key
  (`getProperty(update, "applications", ...)` in AddonUpdateChecker.sys.mjs). A
  `browser_specific_settings` key in `updates.json` is silently ignored. uBlock Origin's own
  `dist/firefox/updates.json` uses `browser_specific_settings` there, so it's a common mistake.
  When omitted, `strict_min_version` falls back to the platform default.

**Adding `update_url` in a later version works, but only for users who install that version.**
"Once an extension is installed, Firefox continues using the update_url from the installed version
to check for updates. If that update manifest becomes unavailable or you need to move it, existing
installations cannot discover a new update_url on their own"
([Updating your extension](https://extensionworkshop.com/documentation/manage/updating-your-extension/)).
A version without `update_url` checks AMO for *listed* versions only. Users of an unlisted build
without `update_url` would therefore have to reinstall by hand. So put `update_url` in the first
signed build.

**Listed vs unlisted lint rule for `update_url`.** The linter raises `MANIFEST_UPDATE_URL`
(*error*) only when not run with `--self-hosted`
([addons-linter manifestjson.js](https://github.com/mozilla/addons-linter/blob/master/src/parsers/manifestjson.js)).
AMO passes `--self-hosted` for unlisted uploads (`run_addons_linter` in
[devhub/tasks.py](https://github.com/mozilla/addons-server/blob/master/src/olympia/devhub/tasks.py)).
In practice: `update_url` is fine for unlisted and rejected for listed. Run
`web-ext lint --self-hosted` locally to match AMO's unlisted checks. I confirmed this locally
(web-ext 10.8.0): plain `lint` gives 1 error `MANIFEST_UPDATE_URL`, and `lint --self-hosted` gives
0 errors.

**Migrating to a listed AMO version later.** The docs describe this for retiring a beta channel:
"you can release a final beta version without an update URL in the manifest. This will tell Firefox
to check AMO for updates, and within a few days users will be migrated"
([Distribute pre-release versions](https://extensionworkshop.com/documentation/publish/distribute-pre-release-versions/)).

## 2. Install UX from a link

**Content-Type is what triggers the install flow.** "The web-accessible server must serve the signed
add-on xpi file with `Content-Type: application/x-xpinstall` in the HTTP response headers." A plain
`<a href>` is the recommended trigger. A JS-initiated navigation must happen inside a user-input
handler. If the trigger is in a frame, "none of the frames between the top-level page and the frame
... can be third-party or cross-origin frames." `InstallTrigger` was removed in Firefox 144
([self-distribution](https://extensionworkshop.com/documentation/publish/self-distribution/)).
In Firefox code, `amContentHandler.sys.mjs` only handles `application/x-xpinstall` and checks
`xpinstall.userActivation.required` (default true)
([amContentHandler.sys.mjs](https://github.com/mozilla-firefox/firefox/blob/main/toolkit/mozapps/extensions/amContentHandler.sys.mjs)).
Any other content type is just a file download.

**GitHub release assets.** `github.com/.../releases/download/...` returns a 302 to
`release-assets.githubusercontent.com`. That host sets `Content-Type` from the asset's stored media
type, which is passed in via `rsct=`/`response-content-type=`, and sends
`content-disposition: inline`. Tested 2026-10-15 with `curl -sIL` on
`gorhill/uBlock` 1.75.0 `...firefox.signed.xpi`: final `content-type: application/x-xpinstall`.
`gh api` shows recent uBlock, Dark Reader and Violentmonkey `.xpi` assets all stored as
`application/x-xpinstall`.
- The media type is whatever the uploader sends: "Use the required Content-Type header to provide
  the media type of the asset." The *Update a release asset* endpoint only accepts
  `name`/`label`/`state`, so a wrong type means re-uploading the asset
  ([GitHub REST: release assets](https://docs.github.com/en/rest/releases/assets#upload-a-release-asset)).
- `gh release upload` picks the type by extension. It has a hardcoded list without `.xpi`, then
  falls back to Go's `mime.TypeByExtension`, then to `application/octet-stream`
  ([cli/cli upload.go](https://github.com/cli/cli/blob/trunk/pkg/cmd/release/shared/upload.go)).
  On Linux, Go reads `/usr/share/mime/globs2` and `/etc/mime.types`
  ([go src/mime/type_unix.go](https://github.com/golang/go/blob/master/src/mime/type_unix.go)),
  and Debian's `media-types` maps `xpi` → `application/x-xpinstall`
  ([salsa mime.types](https://salsa.debian.org/debian/media-types/-/blob/master/mime.types)).
  So a Linux CI runner *probably* uploads the right type, but **verify `content_type` after upload**.
- A stable "latest" link has this shape: `/releases/latest/download/asset-name.zip`
  ([Linking to releases](https://docs.github.com/en/repositories/releasing-projects-on-github/linking-to-releases)).

**Prompts.** Firefox ships with one `install` permission allowlisted:
`origin install 1 https://addons.mozilla.org`
([browser/app/permissions](https://github.com/mozilla-firefox/firefox/blob/main/browser/app/permissions)).
On any other origin, `installAddonFromWebpage` takes the third-party path. With
`extensions.postDownloadThirdPartyPrompt` = true (desktop default,
[firefox.js](https://github.com/mozilla-firefox/firefox/blob/main/browser/app/profile/firefox.js)),
Firefox downloads the XPI first and then shows the `addon-install-blocked` prompt. The only
exceptions are add-ons with `canBypassThirdParyInstallPrompt` (e.g. recommended add-ons)
([AddonManager.sys.mjs](https://github.com/mozilla-firefox/firefox/blob/main/toolkit/mozapps/extensions/AddonManager.sys.mjs),
`_verifyThirdPartyInstall`).
- For a normal page, the prompt text is "Allow {host} to install an add-on? You are attempting to
  install an add-on from {host}. Make sure you trust this site before continuing.", with buttons
  **Continue to Installation** / Don't Allow / Never Allow
  ([addonNotifications.ftl](https://github.com/mozilla-firefox/firefox/blob/main/browser/locales/en-US/browser/addonNotifications.ftl),
  [browser-addons.js](https://github.com/mozilla-firefox/firefox/blob/main/browser/base/content/browser-addons.js)).
- The older "Firefox prevented this site from asking you to install software on your computer"
  string (`xpinstall-prompt`) is now only used for `addon-install-origin-blocked`/`webapi-blocked`.
  That covers cross-origin frames, null principals, and a principal that doesn't subsume the page.
- **Only listing on AMO avoids the third-party prompt.** It's followed by the normal permissions
  prompt, which with Firefox 140+ includes the data-collection section.
- The prompt names the *page* origin (e.g. `savr.link` or `github.com`), not the XPI host.
- If the manifest declares `install_origins`, both the installing page and the XPI URL must match
  (`validInstallOrigins`). So leave `install_origins` unset unless both are pinned.

**HTTPS.** `XPIInstall.isInstallAllowed` requires `https`/`chrome`/`file` when
`extensions.install.requireSecureOrigin` is true (default). It only decides the no-prompt
"allowlisted" path, though
([XPIInstall.sys.mjs](https://github.com/mozilla-firefox/firefox/blob/main/toolkit/mozapps/extensions/internal/XPIInstall.sys.mjs)).
I didn't confirm whether an http page can still reach the third-party prompt. Moot: serve over
HTTPS.

**Install from a file.** This is documented: Add-ons Manager → gear → **Install Add-on From File**
([Installing self-distributed extensions](https://extensionworkshop.com/documentation/publish/install-self-distributed/)).
Firefox code describes front-end installs as "drag-and-drop of xpis or 'Install Add-on from File'"
(AddonManager.sys.mjs, `installAddonFromAOM` doc comment), so dropping onto about:addons is
supported. Opening an `.xpi` from the Downloads panel isn't special-cased in Downloads code
(no `xpi` handling in `DownloadIntegration.sys.mjs`/`DownloadsCommon.sys.mjs`), so it's left to the
OS file association → **manual test**.
**Android:** web download doesn't install. Users must enable the hidden "Install Extension from
File" menu (tap the logo 5× in About Firefox) (same page).

**Hosting recommendation.**
- *GitHub Releases* works if the asset's `content_type` is `application/x-xpinstall`. It's also
  simple for `update_link`, and uBlock's self-hosted beta channel uses GitHub release URLs as
  `update_link`.
- *savr.link* runs on Netlify (`server: Netlify` response header). Add `public/_headers` with:
  ```
  /extension/*.xpi
    Content-Type: application/x-xpinstall
  ```
  Netlify's limitations list doesn't include `Content-Type` among non-settable headers
  ([Netlify custom headers](https://docs.netlify.com/manage/routing/headers/)). That's an inference
  from omission, so **verify with `curl -I`**.
- *GitHub Pages*: MIME types come from `mime-db` and can't be overridden per file
  ([GitHub docs, Enterprise Server copy](https://docs.github.com/en/enterprise/2.14/user/articles/mime-types-on-github-pages)).
  `mime-db` has `application/x-xpinstall: ["xpi"]`
  ([mime-db db.json](https://github.com/jshttp/mime-db/blob/master/db.json)), so Pages should serve
  it correctly. Not tested.
- Put `updates.json` on savr.link (Netlify) so its URL never changes. Point `update_link` at
  versioned GitHub release assets or at `/extension/savr-<ver>.xpi` on savr.link.

## 3. `data_collection_permissions`

**Timeline and scope.**
- "From November 3, 2025, all new extensions must adopt the Firefox built-in data collection
  consent system ... New versions and updates for add-ons created before November 3 don't need to
  use this feature, but will have to at a later date"
  ([Firefox built-in data consent](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/),
  last updated Mar 12 2026).
- The announcement adds: "Once any extension starts using these data_collection_permissions keys in
  a new version, it will need to continue using them for all subsequent versions", and "In the first
  half of 2026, Mozilla will require all extensions to adopt this framework"
  ([blog, 2025-10-23](https://blog.mozilla.org/addons/2025/10/23/data-collection-consent-changes-for-new-firefox-extensions/)).
  The Add-ons blog has published no follow-up announcement through 2026-09-29 (checked the
  blog's WP JSON post list), so that expansion is **unconfirmed**.
- The Add-on Policies apply to "all add-ons ... regardless of how they are distributed"
  ([Add-on Policies](https://extensionworkshop.com/documentation/publish/add-on-policies/),
  updated Apr 30 2026).

**What AMO actually enforces, per its source.** `check_data_collection_permissions` in
[devhub/tasks.py](https://github.com/mozilla/addons-server/blob/master/src/olympia/devhub/tasks.py)
upgrades the linter's `MISSING_DATA_COLLECTION_PERMISSIONS` warning to an **error** only when all
of these hold: the waffle switch `enforce-data-collection-for-new-addons` is on,
`upload.source == amo.UPLOAD_SOURCE_DEVHUB`, and the upload is for a new add-on.
- This applies to **both channels**; the check has no channel condition.
- The tests `test_switch_enabled_and_new_extension_without_data_collection_from_signing_api` and
  `..._from_addon_api` assert **0 errors / 1 warning** for API uploads
  ([test_tasks.py](https://github.com/mozilla/addons-server/blob/master/src/olympia/devhub/tests/test_tasks.py)).
- So `web-ext sign` (Add-on API v5) is *not* blocked today. Don't rely on that: policy says to
  declare it, and the requirement is documented as coming.

**Firefox support.** Desktop 140+, Android 142+ (Extension Workshop page above). This matches the
BCD bundled in web-ext 10.8.0: `firefox.version_added: "140"`, `firefox_android: "142"`.

**Linter behaviour** (ran `web-ext lint` 10.8.0 locally on copies of our manifest):
- No key: `MISSING_DATA_COLLECTION_PERMISSIONS` (*warning*): "...required for all new Firefox
  extensions, and will be required for new versions of existing extensions in the future"
  ([rules.md](https://github.com/mozilla/addons-linter/blob/master/docs/rules.md)).
- Key present with `strict_min_version` 128: `KEY_FIREFOX_UNSUPPORTED_BY_MIN_VERSION` and
  `KEY_FIREFOX_ANDROID_UNSUPPORTED_BY_MIN_VERSION` (*warnings*, not errors). For example:
  "strict_min_version requires Firefox 128, which was released before version 140 introduced
  support for browser_specific_settings.gecko.data_collection_permissions".
- Key + `strict_min_version` 140 + `gecko_android.strict_min_version` 142 + `--self-hosted`:
  the only warning left is `BACKGROUND_SERVICE_WORKER_IGNORED` (expected; see Q5).
- Hard errors: `NONE_DATA_COLLECTION_IS_EXCLUSIVE` (`none` combined with others) and
  `HAS_PREVIOUS_CONSENT_IS_RESERVED`.

**Older Firefox.** "If your extension collects data and a user installs it on Firefox for desktop
139 or earlier ... it must display a custom data collection experience". The options are: set
`strict_min_version` 140/142, turn off collection on old versions, or build a custom consent UI
(Extension Workshop page above; policy §6.2.2). With `none`, nothing is collected, so no fallback
is needed.

**Categories** (manifest value, then the docs' definition):
- Personal data:
  - `personallyIdentifyingInfo`, `healthInfo`, `financialAndPaymentInfo`, `authenticationInfo`,
    `personalCommunications`: not eligible for implicit consent.
  - `locationInfo`.
  - `browsingActivity`: "Information about the websites users visit, such as specific URLs,
    domains, or categories of pages users view".
  - `websiteContent`: "Covers anything visible on a website -- such as text, images, videos, and
    links -- and anything embedded, such as cookies, audio, page headers, and request and response
    information".
  - `websiteActivity`, `searchTerms`, `bookmarksInfo`.
- Technical: `technicalAndInteraction`, which may only be optional.
- `required` accepts `none` or the personal types; `optional` additionally accepts
  `technicalAndInteraction`
  ([MDN](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings)).
- On update, Firefox only prompts for *added* required types, "unless it's the special none data
  type".

**Definition.** "data transmission refers to any data that is collected, used, transferred, shared,
or handled outside of the add-on or the local browser" (Policies §6). MDN phrases the key as "data
types that the extension collects and transmits for storage and processing outside the extension".
The docs **don't address** two cases: (a) handing data to a web page served by the developer that
processes it client-side, or (b) sending data to a user-chosen destination (remoteStorage/Dropbox).
No primary source settles them.

**Reasoned recommendation for Savr: declare `required: ["websiteContent", "browsingActivity"]`.**
- The extension reads the full DOM HTML and URL of the active tab. It `postMessage`s them into a
  savr.link tab (code the developer serves). That app then stores the data off-device via the
  user's sync backend, and optionally proxies image fetches or sends text to a summarization
  provider.
- Even if the hand-off itself stays "in the local browser", the data's purpose is to be "handled
  outside of the add-on", and MDN's wording ("for storage and processing outside the extension")
  fits.
- `websiteContent` covers the HTML (and YouTube transcript). `browsingActivity` covers the URL.
  Both are "eligible for implicit consent". That eligibility only matters for AMO-hosted add-ons
  using a custom consent flow (Policies §6.2.2.2), and the built-in prompt replaces it anyway.
- `none` is defensible only under the narrow reading that a page in the same browser is "local".
  If a reviewer disagrees, the add-on can be rejected/blocked: §6.2.1 requires it to "accurately
  state the data collection practices".
- Costs of declaring: the install prompt lists the two data types, and we must raise
  `strict_min_version` to 140/142 (or build a ≤139 consent UI).
- Optional `technicalAndInteraction` is unnecessary; the extension sends no telemetry.

## 4. `web-ext sign`

- **Version:** web-ext **10.8.0**, released 2026-10-15
  ([releases](https://github.com/mozilla/web-ext/releases)). It requires Node ≥20 (package.json
  `engines`) and bundles addons-linter 10.14.0 (Firefox 158 schema).
- **Channels:** `--channel` is required, `listed` | `unlisted`. "unlisted: The extension gets
  submitted for signing for self-distribution on your website". With unlisted, web-ext "downloads a
  signed copy of the extension" into `--artifacts-dir` (default `web-ext-artifacts/`)
  ([command reference](https://extensionworkshop.com/documentation/develop/web-ext-command-reference/)).
- **Waiting:** `--approval-timeout` defaults to 15 min (900000 ms), or `0` to not wait. `--timeout`
  defaults to 5 min.
- **`--amo-metadata`:** a JSON file passed to the Add-on/Version Create API. It's required for the
  first **listed** version ("categories", "summary" and `version.license` must be present) and
  optional for updates (e.g. `{"version":{"approval_notes":"..."}}`). The reference describes it
  only for listed, so it isn't needed for unlisted.
- **Credentials:** the API key is the JWT issuer (`user:12345:67`, env `WEB_EXT_API_KEY`). The API
  secret is the JWT secret (env `WEB_EXT_API_SECRET`). Get them from
  https://addons.mozilla.org/en-US/developers/addon/api/key/. "Keep your API keys secret and never
  commit them to a public code repository"
  ([addons-server auth docs](https://mozilla.github.io/addons-server/topics/api/auth.html)). Other
  options can be set via `WEB_EXT_*` env vars, e.g. `WEB_EXT_CHANNEL`.
- **Version uniqueness:** each version string can be submitted only once per add-on, across both
  channels and including deleted versions. `validate_version_number_does_not_exist` returns
  "Version {v} already exists." or "Version {v} was uploaded before and deleted."
  ([versions/utils.py](https://github.com/mozilla/addons-server/blob/master/src/olympia/versions/utils.py)).
  A new **listed** version must also be greater than the latest signed listed version (same file).
  **You cannot re-sign the same version number; bump `version` every time.**
- **Signing time:** "It can take up to 24 hours for your submission to be signed and published, or
  longer if your submission is selected for manual review", and "All add-ons, including
  self-distributed ones, are subject to be manually reviewed at any time after submission"
  ([Signing and distribution overview](https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/)).
  No primary source gives a typical unlisted auto-sign time; anecdotally it's minutes, which is why
  web-ext waits 15 min by default.
- **Source code:** required only when code is "created using" minifiers, bundlers (webpack,
  browserify), template engines or other preprocessing
  ([Source code submission](https://extensionworkshop.com/documentation/publish/source-code-submission/)).
  `browser-extension/` has no build step: 5 hand-written JS files, ~23 KB. So no source upload, as
  long as `youtube-transcript.js` stays unminified. Its header says it relates to the app's
  `minify-bookmarklet` Vite build, so **check the shipped file is readable source**.
- **CI:** there's no official GitHub Action; web-ext is a Node CLI driven by env vars. A minimal job:
  ```yaml
  - uses: actions/setup-node@v4
    with: { node-version: 22 }
  - run: npx web-ext@10 lint --source-dir browser-extension --self-hosted
  - run: npx web-ext@10 sign --source-dir browser-extension --channel unlisted --artifacts-dir dist-ext
    env:
      WEB_EXT_API_KEY: ${{ secrets.AMO_JWT_ISSUER }}
      WEB_EXT_API_SECRET: ${{ secrets.AMO_JWT_SECRET }}
  - run: gh release upload "ext-v$VERSION" dist-ext/*.xpi   # then verify content_type
  ```
  web-ext also supports `--api-proxy` for restricted networks
  ([Getting started with web-ext](https://extensionworkshop.com/documentation/develop/getting-started-with-web-ext/)).
- **Supported signing methods:** "web-ext sign Version 8 and higher: Initial submission and updates
  for extensions listed on AMO or self-distributed (unlisted)" (signing overview).

## 5. Chrome and other Chromium browsers

**Consumer self-hosted `.crx`:**
- "Linux is the only platform where Chrome users can install extensions that are hosted outside of
  the Chrome Web Store." For link-click installs the file must be served as
  `application/x-chrome-extension` (or meet the `.crx` + no-`nosniff` exception)
  ([Hosting on Linux](https://developer.chrome.com/docs/extensions/how-to/distribute/host-on-linux),
  last updated 2017).
- External (preferences/registry) installs from local CRX paths have been blocked on Windows since
  Chrome 33 and on Mac since Chrome 44. On Windows/macOS, `update_URL` "must point to the Chrome
  Web Store"
  ([Alternative installation methods](https://developer.chrome.com/docs/extensions/how-to/distribute/install-extensions)).
- What happens in source:
  - Downloading a `.crx` from a website fails with `OFFSTORE_INSTALL_DISALLOWED` unless
    `off_store_install_allow_reason_` is set
    ([crx_installer.cc](https://chromium.googlesource.com/chromium/src/+/main/extensions/browser/crx_installer.cc)).
  - Dragging a `.crx` onto chrome://extensions in Developer mode sets
    `OffStoreInstallAllowedFromSettingsPage` and uses the plain `CRX3` verifier, so the install
    itself proceeds.
  - The `InstallVerifier` then runs in `ENFORCE` mode when
    `BUILDFLAG(GOOGLE_CHROME_BRANDING) && (IS_WIN || IS_MAC)`, and `NONE` otherwise. It disables
    packed extensions that aren't from the store, unless they are unpacked, component, or allowed
    by enterprise policy (outside a "low-trust environment")
    ([install_verifier.cc](https://chromium.googlesource.com/chromium/src/+/main/extensions/browser/install_verifier.cc)).
- **Net effect:**
  - Google Chrome on Windows/macOS: a self-hosted `.crx` gets disabled for consumers.
  - Google Chrome on Linux: drag-drop in Developer mode, or a correctly-typed link, works.
  - Non-Google-branded Chromium builds (Chromium, likely Brave/Vivaldi/Opera/Edge) don't run the
    verifier at all. Each vendor may add its own checks, so **verify per browser**.

**Enterprise path.** `ExtensionInstallForcelist` entries are `extension_id;update_url`, and the
update URL points to an update-manifest XML ([policy definition](https://chromium.googlesource.com/chromium/src/+/main/components/policy/resources/templates/policy_definitions/Extensions/ExtensionInstallForcelist.yaml)).
- "On Microsoft® Windows® instances, apps and extensions from outside the Chrome Web Store can only
  be forced installed if the instance is joined to a Microsoft® Active Directory® domain, joined
  to Microsoft® Azure® Active Directory® or enrolled in Chrome Enterprise Core." The macOS
  equivalent requires MDM, MCX, or Chrome Enterprise Core enrolment.
- `ExtensionInstallSources` lists URL patterns, for both the `.crx` location and the referrer, that
  get the old click-to-install flow
  ([policy](https://chromium.googlesource.com/chromium/src/+/main/components/policy/resources/templates/policy_definitions/Extensions/ExtensionInstallSources.yaml)).
- Fine for a company. Not a consumer path.

**Chrome Web Store:**
- **Visibility:** "Unlisted: ... does not create a listing on the Chrome Web Store, but does allows
  anyone to install your item if they know its Chrome Web Store URL". "All visibility settings have
  the same policy requirements and will go through the same review process"
  ([Distribution tab](https://developer.chrome.com/docs/webstore/cws-dashboard-distribution)).
- **Fee:** "pay a one-time registration fee"
  ([Register](https://developer.chrome.com/docs/webstore/register), updated 2024-02-13). The page
  doesn't state the amount. The Chromium blog gave it as $5.00 in March 2020
  ([blog.chromium.org](https://blog.chromium.org/2020/03/new-developer-dashboard-and.html)); the
  current amount is **unverified**.
- **Review:** "For most extensions, review is completed within a few days, but it can take up to a
  few weeks". "Reviews may take longer for extensions that request broad host permissions or
  sensitive execution permissions"
  ([Review process](https://developer.chrome.com/docs/webstore/review-process)). Our
  `optional_host_permissions: ["*://*/*"]` and `scripting` may count.
- **Privacy tab:** requires a single-purpose statement, a justification per permission, a remote
  code declaration, data-usage disclosures plus certification, and a privacy-policy URL
  ([Privacy tab](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)).
  `PrivacyPolicy.md` exists in the repo; it needs a public URL.

**Load unpacked:** Developer mode → Load unpacked is documented by Vivaldi
([help.vivaldi.com](https://help.vivaldi.com/desktop/appearance-customization/extensions/)) and is
what our README and e2e tests use. Unpacked extensions are exempt from the install verifier
(`IsUnpackedLocation` → not disabled). They don't auto-update and need Developer mode on.
Chrome-specific warnings for unpacked extensions are **unverified**; see the list below.

**Other Chromium browsers and the CWS:**
- **Edge:** "Extensions designed for Google Chrome can also be used in Microsoft Edge ... If you
  haven't allowed extensions from other store, you may be shown a dialog to Allow extensions from
  other stores"
  ([Microsoft Support](https://support.microsoft.com/en-us/microsoft-edge/add-turn-off-or-remove-extensions-in-microsoft-edge-9c0ec68c-2fbc-2f2c-9ff0-bdc76f46b026)).
  Edge Add-ons as its own store: "There is no registration fee for submitting extensions to the
  Microsoft Edge program"
  ([Register as an Edge extension developer](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/create-dev-account),
  updated 2026-09-02).
- **Brave:** its official support article describes installing from the Chrome Web Store with
  "Add to Brave" ([support.brave.app](https://support.brave.app/hc/en-us/articles/360017909112)).
- **Vivaldi:** "Click Add to Vivaldi". If the button is missing, enable Settings → Privacy and
  Security → Google Extensions → Web Store
  ([help.vivaldi.com](https://help.vivaldi.com/desktop/appearance-customization/extensions/)).
- **Opera:** needs the "Install Chrome Extensions" helper add-on, per community/forum sources only.
  **No primary Opera doc found.**

**Our manifest on Chrome:**
- `browser_specific_settings` is in Chromium's `kIgnoredUnrecognizedKeys`, so it's skipped
  **without even a warning**
  ([manifest_constants.h](https://chromium.googlesource.com/chromium/src/+/main/extensions/common/manifest_constants.h),
  [manifest.cc](https://chromium.googlesource.com/chromium/src/+/main/extensions/common/manifest.cc)).
  MDN agrees: "Chrome doesn't use this key and ignores it".
- `background.scripts` + `service_worker`: "before Chrome 121, Chrome refuses to load a Manifest V3
  extension with background.scripts or background.page present. From Chrome 121, their presence in
  a Manifest V3 extension is ignored". Firefox uses `scripts`, and since Firefox 121 it starts the
  background page even when `service_worker` is present
  ([MDN background](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background),
  modified 2026-10-14). Our `strict_min_version` (128+) is past that fix.
- Whether the **CWS upload validator** accepts this combination isn't documented. It's very common
  (MDN recommends it), but **unverified**.
- addons-linter warns `BACKGROUND_SERVICE_WORKER_IGNORED` on Firefox. It's harmless: the paired
  `scripts` avoids the `..._NOFALLBACK` error.
- `"type": "module"` applies to both the Chrome service worker and the Firefox background scripts.
  Not separately researched.

## Unverified / needs manual test

1. **GitHub release install flow end-to-end.** Click a `releases/latest/download/*.xpi` link from
   github.com and from savr.link in release Firefox. Check that the "Allow *host* to install"
   prompt appears and installs. Check that `gh release upload` from our CI stores
   `application/x-xpinstall` (`gh api .../releases/latest --jq '.assets[].content_type'`).
2. **Netlify** honours a `_headers` `Content-Type` override for `.xpi`. Check with `curl -I`.
3. **Opening a downloaded `.xpi` from the Downloads panel** (OS-dependent) and **drag-drop onto
   about:addons** on Windows/macOS/Linux.
4. **http:// install pages:** whether the third-party prompt is reachable without a secure origin.
   Irrelevant if we only use https.
5. **Unlisted signing latency** in practice (minutes vs hours) and whether our first unlisted
   upload is picked for manual review.
6. **AMO enforcement of `data_collection_permissions` for API uploads.** Today's code says warning
   only. Re-check before relying on it; the stated plan is to require it for all extensions.
7. **Mozilla reviewer stance on `none` vs `websiteContent`/`browsingActivity`** for a "hand off to
   a client-side web app" extension. No primary source covers this case. You could ask on the
   Mozilla add-ons Discourse/Matrix.
8. **Firefox update fetch following GitHub's 302 redirect for `update_link`.** uBlock's beta channel
   relies on it, but I didn't read the code path.
9. **CWS upload** of a manifest with both `background.scripts` and `service_worker`, plus
   `browser_specific_settings`. Expected to pass with at most a warning. Also: current CWS
   registration fee amount and developer verification requirements.
10. **Chrome-branded Linux** drag-drop of a self-packed `.crx` in Developer mode. **Brave, Vivaldi
    and Edge** behaviour with an off-store `.crx`: their own builds may add checks the Chromium
    code doesn't show.
11. **Opera** CWS installs: there's no primary documentation.
