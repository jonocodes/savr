# Privacy & telemetry

The hosted app at `savr.link` collects a small amount of **anonymous** usage data so we can answer basic questions like "how many people use Savr, roughly where are they, and are they installing it." It is designed to respect the project's privacy-first goals, and it is easy to turn off (see [Opting out](#opting-out)).

Telemetry is via [GoatCounter](https://www.goatcounter.com), which is cookieless and stores no persistent visitor id.

## We only record *that* an event happened — never *what*

Each event is nothing more than a tally mark that something occurred. `capture-url` means "an article was saved from a URL" — it does **not** include the URL, the title, or the content. In fact GoatCounter has no way to attach that data even if we wanted to: an event carries only its name, plus your country (derived server-side from your IP; the IP itself is discarded and never stored). There is no article-level data, and no identity, anywhere in the pipeline.

## The complete list of events

This is everything Savr ever sends:

| Event | Sent when |
| ----- | --------- |
| `app-open` | The app is opened or loaded |
| `app-standalone` | The app is opened as an installed PWA (fired alongside `app-open`) |
| `capture-url` | An article is saved from a URL |
| `capture-bookmarklet` | An article is saved via the bookmarklet |
| `capture-raw` | An article is saved via a site-specific bookmarklet (pre-extracted content) |
| `capture-paste` | An article is saved by pasting text, HTML, or Markdown |
| `capture-file` | An article is saved by uploading a PDF or image |
| `capture-failed` | An article capture fails (used to spot CORS-proxy trouble; no URL or details attached) |
| `pwa-install-accepted` | The user accepts the PWA install prompt (Chromium only) |
| `pwa-install-dismissed` | The user dismisses the PWA install prompt (Chromium only) |
| `sync-connect-dropbox` | Cloud sync is connected to Dropbox |
| `sync-connect-googledrive` | Cloud sync is connected to Google Drive |
| `sync-connect-remotestorage` | Cloud sync is connected to a remoteStorage provider (user@host account) |

## What is never collected

Article URLs, titles, or content; your cloud account address or any identity; API keys; or anything that could identify you or what you read. Sync events record the provider **type** only, never the account.

## Reporting a failed article

Separately from telemetry, Savr can offer to file a **public GitHub issue** when an article fails to load. It is strictly user-initiated: only if the build was configured with `VITE_FAILURE_REPORT_REPO` (unset for self-hosted builds) does an error dialog offer **File on GitHub**. You can dismiss it, and you review and edit the diagnostic payload before anything is sent.

If you choose to file, the browser opens GitHub's prefilled new-issue form **under your own GitHub account** — the issue is public and Savr itself never makes a network request for this. The payload contains the failed URL, the error message, the running instance's URL, the app version/build (the deploy time), PWA-vs-browser mode, and your browser's user agent. It never includes article content, your reading data, or any account credentials.

Filing also asks GitHub to apply the `failed-url` label. GitHub only applies labels for reporters who have permission on the target repo, so reports from outside contributors arrive labelled only by the `[failed-url]` title prefix.

## Opting out

It is on by default but you can turn it off any time under **Preferences → Privacy → "Share anonymous usage statistics."** It is also automatically disabled if your browser sends a [Global Privacy Control](https://globalprivacycontrol.org/) signal — in that case the preference is shown disabled, since Savr is already honoring your browser.

## Self-hosting

Telemetry is **off by default** for self-hosted builds. It only activates when a GoatCounter endpoint is provided at build time:

- `VITE_GOATCOUNTER_URL` — your GoatCounter "count" endpoint, e.g. `https://yourcode.goatcounter.com/count`. Leave unset to disable telemetry entirely (the Privacy preference is then hidden).
- `VITE_GOATCOUNTER_SCRIPT` — optional; overrides the tracker script URL (defaults to `https://gc.zgo.at/count.js`).

## Excluding your own visits (for maintainers)

`localhost` and private networks are ignored by GoatCounter automatically, and you can exclude a specific browser by visiting the site once with `#toggle-goatcounter` appended to the URL. See [GoatCounter's docs](https://www.goatcounter.com/help/skip-dev).
