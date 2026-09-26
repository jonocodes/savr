export interface FailureReportError {
  category: string;
  message: string;
  detail?: string;
}

export interface FailureReportPayload {
  url: string;
  error: FailureReportError;
  app: {
    version: string;
    buildTimestamp: string;
    mode: string;
  };
  browser: {
    userAgent?: string;
  };
  reportedAt: string;
}

export interface BuildFailureReportPayloadInput {
  url: string;
  error: FailureReportError;
  app: FailureReportPayload["app"];
  userAgent: string;
  reportedAt?: string;
}

export type FailureReportParseResult =
  | { ok: true; payload: FailureReportPayload }
  | { ok: false; error: string };

// GitHub accepts long URLs, but browsers and proxies grow unreliable well
// before the theoretical limit. Stay comfortably below 8 KB.
export const DEFAULT_MAX_ISSUE_URL_LENGTH = 6000;

const DETAIL_TRUNCATION = 200;
const USER_AGENT_TRUNCATION = 120;
const URL_TRUNCATION = 300;

export function buildFailureReportPayload(
  input: BuildFailureReportPayloadInput
): FailureReportPayload {
  return {
    url: input.url,
    error: input.error,
    app: input.app,
    browser: { userAgent: input.userAgent },
    reportedAt: input.reportedAt ?? new Date().toISOString(),
  };
}

export function formatFailureReportPayload(payload: FailureReportPayload): string {
  return JSON.stringify(payload, null, 2);
}

export function parseFailureReportPayload(text: string): FailureReportParseResult {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }

  if (!isFailureReportPayload(value)) {
    return { ok: false, error: "Payload must include a url and an error message" };
  }

  return { ok: true, payload: value };
}

export function buildFailureReportIssueUrl(
  repo: string,
  payload: FailureReportPayload,
  options: { maxUrlLength?: number } = {}
): string {
  const maxUrlLength = options.maxUrlLength ?? DEFAULT_MAX_ISSUE_URL_LENGTH;
  const fits = (candidate: FailureReportPayload) =>
    composeIssueUrl(repo, candidate).length <= maxUrlLength;

  if (fits(payload)) {
    return composeIssueUrl(repo, payload);
  }

  // Trim the free-text detail first, then the user agent; drop fields only
  // when truncating them is not enough.
  const trimmed: FailureReportPayload = {
    ...payload,
    error: { ...payload.error },
    browser: { ...payload.browser },
  };

  if (trimmed.error.detail) {
    trimmed.error.detail = truncate(trimmed.error.detail, DETAIL_TRUNCATION);
    if (fits(trimmed)) {
      return composeIssueUrl(repo, trimmed);
    }
    delete trimmed.error.detail;
    if (fits(trimmed)) {
      return composeIssueUrl(repo, trimmed);
    }
  }

  if (trimmed.browser.userAgent) {
    trimmed.browser.userAgent = truncate(trimmed.browser.userAgent, USER_AGENT_TRUNCATION);
    if (fits(trimmed)) {
      return composeIssueUrl(repo, trimmed);
    }
    delete trimmed.browser.userAgent;
    if (fits(trimmed)) {
      return composeIssueUrl(repo, trimmed);
    }
  }

  // Last resort: the URL field itself is oversized.
  trimmed.url = truncate(trimmed.url, URL_TRUNCATION);
  return composeIssueUrl(repo, trimmed);
}

function composeIssueUrl(repo: string, payload: FailureReportPayload): string {
  return buildIssueUrl(repo, issueTitle(payload), issueBody(payload));
}

function buildIssueUrl(repo: string, title: string, body: string): string {
  const params = new URLSearchParams({ title, body });
  return `https://github.com/${repo}/issues/new?${params.toString()}`;
}

function issueTitle(payload: FailureReportPayload): string {
  return `[report] ${hostnameOf(payload.url)} — ${payload.error.message}`;
}

function issueBody(payload: FailureReportPayload): string {
  return [
    "Savr failed to load this article.",
    "",
    `**URL:** ${payload.url}`,
    "",
    "<details>",
    "<summary>Diagnostic details</summary>",
    "",
    "```json",
    JSON.stringify(payload),
    "```",
    "",
    "</details>",
  ].join("\n");
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname || url;
  } catch {
    return url;
  }
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}

function isFailureReportPayload(value: unknown): value is FailureReportPayload {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<FailureReportPayload>;
  return (
    typeof candidate.url === "string" &&
    candidate.url.length > 0 &&
    typeof candidate.error === "object" &&
    candidate.error !== null &&
    typeof candidate.error.message === "string" &&
    candidate.error.message.length > 0
  );
}
