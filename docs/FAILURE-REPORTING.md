# Failure reporting (design)

Status: GitHub path implemented (2026-09-25, issue #71); anonymous Worker path proposed

## Problem

When an article fails to load, the only trace is a console message and a transient
snackbar. On mobile there is no console. PR #70 adds a local app log, but the user
still has to copy/paste it to the maintainer by hand. We want a one-tap, explicit
way for a user to send a failure report, so failures can be triaged one article at
a time.

## Flow

1. An article capture fails at `error` level (initially: ingest failures — download,
   content-type detection, processing).
2. A dialog appears: "Report this failed article?"
   - Nothing is sent unless the user explicitly chooses to submit.
3. The dialog shows a short summary plus an **accordion** containing the exact JSON
   payload, which the user can edit before sending.
4. The user picks one of two submission paths, both using the same edited payload
   (v1 ships only the GitHub path; the anonymous path is still proposed):
   - **With GitHub** — opens a prefilled new-issue URL for the reports repo. Filed
     under the user's account, so they get notifications and can follow up when the
     article is fixed.
   - **Anonymously** — POSTs the payload to the Cloudflare Worker, which files the
     issue as a bot. The app then shows the issue URL so the reporter can still watch
     it without an account.
5. One GitHub issue per submission. No dedupe, no queue, no database.

## Payload (v1)

A plain JSON object, shown to the user as editable text before sending:

```json
{
  "url": "https://example.com/article",
  "error": {
    "category": "ingest",
    "message": "Failed to download article",
    "detail": "HTTP 403"
  },
  "app": {
    "version": "1.2.3",
    "buildTimestamp": "2026-09-20T...",
    "mode": "pwa"
  },
  "browser": {
    "userAgent": "Mozilla/5.0 ..."
  },
  "reportedAt": "2026-09-20T..."
}
```

- **Country is added server-side** by the Worker (Cloudflare `request.cf.country`);
  the client never sends location, and the IP is not stored. Consistent with
  `docs/TELEMETRY.md`.
- Open: whether to include the per-article `fetch.log` and/or article title in v1.
  Start minimal — the payload is editable anyway.

## Destination: GitHub Issues

**Use GitHub Issues, not the wiki.**

- Issues are a queue: state (open/closed), labels, comments, search, notifications,
  mobile app, and a REST API the Worker can write to. A wiki is prose; it has no
  per-item state and no practical create-an-item API.
- Prefer a **dedicated public repo** for reports (e.g.
  `jonocodes/savr-failure-reports`) rather than the main `savr` tracker:
  - auto-filed failures will not drown real bugs and feature requests;
  - the Worker's fine-grained PAT can be scoped to that one repo (`Issues: write`);
  - curation tools (labels, saved searches, a GitHub Project board) can be layered
    on later without touching the main tracker.
- Suggested title: `[report] <hostname> — <error message>`. The title prefix is the
  reliable marker for both paths.
- One issue per submission. Dedupe and curation are explicitly deferred.

## Worker

Same Cloudflare account as the existing CORS proxy (`lively-cors-proxy-*.workers.dev`).
Chosen because the project already deploys a Worker there, it has a free tier, secret
storage for the PAT (`wrangler secret put`), built-in per-IP rate limiting, and
`request.cf.country` for the server-side country field. Keep it dumb:

- Accept `POST` with JSON body only (`Content-Type: application/json`); cap body
  size; validate the minimal shape.
- **Origin allowlist.** Only return `Access-Control-Allow-Origin` for exact-match
  allowlisted origins (production: `https://savr.link`; configurable via env var for
  self-hosted Workers). Requiring `application/json` forces a CORS preflight, so the
  browser refuses to send the real POST from any other origin; the POST handler
  re-checks `Origin` as well. Never return `*`.
- Per-IP rate limit (Cloudflare built-in rules are enough).
- Create the issue with a fine-grained PAT scoped to the reports repo. The issue is
  posted by the bot, so the reporter stays anonymous.
- No database, no dedupe, no retry queue.

The Origin allowlist stops other websites and drive-by browser abuse, but **not**
`curl` (the client is a public static app; no client-side secret exists). Combined
with rate limiting and closing junk issues, that is sufficient for v1. If abuse
becomes real, the next step is invisible Cloudflare Turnstile.

The GitHub path is configured at build time with `VITE_FAILURE_REPORT_REPO`. When
unset (self-hosted builds, local dev), the report dialog is hidden; self-hosters can
point it at their own reports repo — same pattern as `VITE_GOATCOUNTER_URL` telemetry.
The proposed Worker path would add a `VITE_FAILURE_REPORT_URL` alongside it.

## Privacy

- This is **not telemetry**: it is user-initiated publishing. `docs/TELEMETRY.md`
  promises anonymous tallies only and should get a short section distinguishing the
  two.
- Per-report opt-in, default off; the user sees and can edit the exact payload.
- The URL is public and permanent once filed. Show the payload before sending.
- Say which is which in the dialog: on the GitHub path the issue is public under the
  reporter's handle (and they get notifications); on the Worker path it is public but
  posted by a bot, and the app surfaces the issue link so they can still follow it.
- Open: strip query strings by default (tokens, session IDs), or leave that to the
  user to edit.

## Alternatives considered

- **GitHub Action.** Cannot receive HTTP requests; Actions run on events. Triggering
  one via `repository_dispatch` needs a token, and a token cannot live in the public
  client. An Action could only be a downstream consumer, which adds indirection for
  no gain over the Worker creating the issue directly.
- **Vercel / Lambda.** Would work, but is more setup and an extra vendor for one tiny
  endpoint when a Worker is already in use.
- **Prefilled `github.com/.../issues/new` link.** Adopted as the "with GitHub"
  submission path (see Flow). Zero infrastructure: the reporter's GitHub account is
  the auth and anti-abuse gate, and GitHub itself is the form UI. Costs: requires a
  GitHub account and login, and it is a context switch on mobile. With no server
  there is no server-side country field, and URL length limits may force a trimmed
  payload. Note GitHub issue forms (YAML) cannot be prefilled per-field via URL —
  only title/body/labels — so the payload goes in the body as a JSON block.
- **Sentry / GlitchTip or a custom ingestion + DB + dashboard.** The industry-standard
  crash-reporting shape, and what "stand up a database" would mean. Overkill at this
  volume; the issue tracker is the triage UI for v1. Revisit if volume grows.

## Non-goals (for now)

- Dedupe / "+1" comments
- A curation or admin UI
- Private reports
- Auto-closing issues when a fix ships
- Analytics over reports

## Open questions

- Trigger set: ingest errors only, or summarization failures too?
- Query-string stripping default?
- Reports repo name.
- Exact dialog copy.
