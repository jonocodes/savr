// "Report this failed article" — builds a prefilled public GitHub issue from an
// article-load failure. Savr makes no network request of its own: the user
// reviews (and can edit) the payload in a dialog, then the browser opens
// GitHub's new-issue form under their own account. See docs/TELEMETRY.md.
//
// Gated by VITE_FAILURE_REPORT_REPO at build time: unset (self-hosted builds,
// local dev) means the dialog and this whole path are absent.

import { BUILD_TIMESTAMP, getFailureReportRepo } from "~/config/environment";
import { isStandalonePwa } from "~/utils/pwa";

/**
 * The failure-report dialog is "configured" only when a public GitHub repo has
 * been provided at build time. Self-host builds leave it empty, so no dialog or
 * affordance appears.
 */
export function isFailureReportConfigured(): boolean {
  return getFailureReportRepo() !== "";
}

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

function isFailureReportPayload(value: unknown): value is FailureReportPayload {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<FailureReportPayload>;
  return (
    isHttpUrl(candidate.url) &&
    typeof candidate.error === "object" &&
    candidate.error !== null &&
    typeof candidate.error.message === "string" &&
    typeof candidate.app === "object" &&
    candidate.app !== null &&
    typeof candidate.browser === "object" &&
    candidate.browser !== null &&
    typeof candidate.reportedAt === "string"
  );
}

/**
 * Parse the (possibly user-edited) payload text from the dialog. Returns null
 * when the text is not JSON, or not JSON shaped like a report — which disables
 * "File on GitHub" rather than filing a malformed issue.
 */
export function parseFailureReportPayload(text: string): FailureReportPayload | null {
  try {
    const parsed: unknown = JSON.parse(text);
    return isFailureReportPayload(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export interface FailureReportError {
  category: string;
  message: string;
  detail?: string;
}

export interface FailureReportPayload {
  url: string;
  error: FailureReportError;
  app: {
    buildTimestamp: string;
    mode: "pwa" | "browser";
    // The running instance, e.g. "https://savr.link" or a Netlify preview.
    origin: string;
  };
  browser: {
    userAgent: string;
  };
  reportedAt: string;
}

// Injectable environment so the builder is deterministic under test.
export interface FailureReportContext {
  buildTimestamp?: string;
  userAgent?: string;
  mode?: "pwa" | "browser";
  origin?: string;
  now?: Date;
}

/**
 * `[failed-url] <hostname> — <message>`, e.g.
 * `[failed-url] example.com — Failed to download article`.
 */
export function buildIssueTitle(payload: FailureReportPayload): string {
  return `[failed-url] ${hostOf(payload.url)} — ${payload.error.message}`;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/**
 * The GitHub issue body: a one-line summary, the article URL, and the payload
 * in a collapsible diagnostics block. Pretty-printed so the filed issue is
 * readable; buildIssueUrl trims the payload when that busts the URL budget.
 */
export function buildIssueBody(payload: FailureReportPayload): string {
  return [
    "Savr failed to load this article.",
    "",
    `**URL:** ${payload.url}`,
    "",
    "<details>",
    "<summary>Diagnostic details</summary>",
    "",
    "```json",
    JSON.stringify(payload, null, 2),
    "```",
    "",
    "</details>",
  ].join("\n");
}

// GitHub accepts long new-issue URLs, but we keep a comfortable margin so the
// report survives browsers and proxies that cap URL length. Anything longer is
// trimmed: free-text fields are shortened first, then dropped.
export const MAX_ISSUE_URL_LENGTH = 6000;
const DETAIL_MAX_LENGTH = 300;
const USER_AGENT_MAX_LENGTH = 150;

function shorten(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max)}…`;
}

/**
 * Payload variants to try, in order, when the initial URL is too long.
 * Trimming beats dropping: a truncated error detail is still useful context.
 */
function trimCandidates(payload: FailureReportPayload): FailureReportPayload[] {
  const candidates: FailureReportPayload[] = [];
  const detail = payload.error.detail;
  const userAgent = payload.browser.userAgent;
  const trimDetail = detail !== undefined && detail.length > DETAIL_MAX_LENGTH;
  const trimUserAgent = userAgent.length > USER_AGENT_MAX_LENGTH;

  const withText = (nextDetail: string | undefined, nextUserAgent: string): FailureReportPayload => ({
    ...payload,
    error:
      nextDetail === undefined
        ? { category: payload.error.category, message: payload.error.message }
        : { ...payload.error, detail: nextDetail },
    browser: { userAgent: nextUserAgent },
  });

  if (trimDetail) candidates.push(withText(shorten(detail, DETAIL_MAX_LENGTH), userAgent));
  if (trimUserAgent) candidates.push(withText(detail, shorten(userAgent, USER_AGENT_MAX_LENGTH)));
  if (trimDetail || trimUserAgent) {
    candidates.push(
      withText(
        detail === undefined ? undefined : shorten(detail, DETAIL_MAX_LENGTH),
        shorten(userAgent, USER_AGENT_MAX_LENGTH),
      ),
    );
  }

  // Last resort: optional fields go, in ascending order of usefulness.
  candidates.push(withText(undefined, userAgent));
  candidates.push(withText(undefined, ""));
  candidates.push({
    ...withText(undefined, ""),
    app: { ...payload.app, buildTimestamp: "" },
  });
  return candidates;
}

// Applied to filed issues when the reporter has permission to set labels;
// ignored otherwise. Created in the repo the reports target.
export const FAILURE_REPORT_LABEL = "failed-url";

function issueUrlFor(repo: string, payload: FailureReportPayload): string {
  const title = encodeURIComponent(buildIssueTitle(payload));
  const body = encodeURIComponent(buildIssueBody(payload));
  const labels = encodeURIComponent(FAILURE_REPORT_LABEL);
  return `https://github.com/${repo}/issues/new?title=${title}&body=${body}&labels=${labels}`;
}

/**
 * The prefilled GitHub new-issue URL for a payload, shortened if needed so the
 * whole URL stays within MAX_ISSUE_URL_LENGTH.
 */
export function buildIssueUrl(repo: string, payload: FailureReportPayload): string {
  let url = issueUrlFor(repo, payload);
  if (url.length <= MAX_ISSUE_URL_LENGTH) return url;

  for (const variant of trimCandidates(payload)) {
    url = issueUrlFor(repo, variant);
    if (url.length <= MAX_ISSUE_URL_LENGTH) return url;
  }
  return url;
}

export function buildFailureReportPayload(
  url: string,
  error: FailureReportError,
  context: FailureReportContext = {},
): FailureReportPayload {
  const mode =
    context.mode ?? (isStandalonePwa() ? "pwa" : "browser");
  const userAgent =
    context.userAgent ??
    (typeof navigator !== "undefined" ? navigator.userAgent : "");
  const origin =
    context.origin ??
    (typeof window !== "undefined" ? window.location.origin : "");

  return {
    url,
    error: error.detail ? { ...error } : { category: error.category, message: error.message },
    app: {
      buildTimestamp: context.buildTimestamp ?? BUILD_TIMESTAMP,
      mode,
      origin,
    },
    browser: { userAgent },
    reportedAt: (context.now ?? new Date()).toISOString(),
  };
}
