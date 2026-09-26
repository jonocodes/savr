import {
  buildFailureReportIssueUrl,
  buildFailureReportPayload,
  formatFailureReportPayload,
  parseFailureReportPayload,
  type FailureReportPayload,
} from "~/utils/reporting/failureReport";

const payload: FailureReportPayload = {
  url: "https://example.com/article",
  error: {
    category: "ingest",
    message: "Failed to download article",
    detail: "HTTP 404: Not Found",
  },
  app: {
    version: "0.6.0",
    buildTimestamp: "2026-09-20T00:00:00.000Z",
    mode: "browser",
  },
  browser: {
    userAgent: "Mozilla/5.0 (Test)",
  },
  reportedAt: "2026-09-20T12:00:00.000Z",
};

describe("buildFailureReportPayload", () => {
  it("assembles the payload from the failure inputs", () => {
    expect(
      buildFailureReportPayload({
        url: "https://example.com/article",
        error: {
          category: "ingest",
          message: "Failed to download article",
          detail: "HTTP 404: Not Found",
        },
        app: {
          version: "0.6.0",
          buildTimestamp: "2026-09-20T00:00:00.000Z",
          mode: "browser",
        },
        userAgent: "Mozilla/5.0 (Test)",
        reportedAt: "2026-09-20T12:00:00.000Z",
      })
    ).toEqual(payload);
  });
});

describe("formatFailureReportPayload / parseFailureReportPayload", () => {
  it("round-trips a payload through the editable text", () => {
    const text = formatFailureReportPayload(payload);

    expect(text).toContain('\n  "url": "https://example.com/article"');

    const parsed = parseFailureReportPayload(text);
    expect(parsed).toEqual({ ok: true, payload });
  });

  it("reports invalid JSON instead of throwing", () => {
    const parsed = parseFailureReportPayload("{ not json }");

    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error.length).toBeGreaterThan(0);
    }
  });
});

describe("buildFailureReportIssueUrl", () => {
  it("builds a prefilled GitHub issue URL for the report", () => {
    const url = buildFailureReportIssueUrl("jonocodes/savr-failure-reports", payload);
    const parsed = new URL(url);

    expect(parsed.origin + parsed.pathname).toBe(
      "https://github.com/jonocodes/savr-failure-reports/issues/new"
    );
    expect(parsed.searchParams.get("title")).toBe(
      "[report] example.com — Failed to download article"
    );
    expect(parsed.searchParams.get("body")).toBe(
      "Savr failed to load this article.\n" +
        "\n" +
        "**URL:** https://example.com/article\n" +
        "\n" +
        "<details>\n" +
        "<summary>Diagnostic details</summary>\n" +
        "\n" +
        "```json\n" +
        '{"url":"https://example.com/article","error":{"category":"ingest","message":"Failed to download article","detail":"HTTP 404: Not Found"},"app":{"version":"0.6.0","buildTimestamp":"2026-09-20T00:00:00.000Z","mode":"browser"},"browser":{"userAgent":"Mozilla/5.0 (Test)"},"reportedAt":"2026-09-20T12:00:00.000Z"}\n' +
        "```\n" +
        "\n" +
        "</details>"
    );
  });

  it("falls back to the raw url when it cannot be parsed as a hostname", () => {
    const url = buildFailureReportIssueUrl("jonocodes/savr-failure-reports", {
      ...payload,
      url: "not a url",
    });

    expect(new URL(url).searchParams.get("title")).toBe(
      "[report] not a url — Failed to download article"
    );
  });

  it("truncates an oversized error detail before touching the user agent", () => {
    const url = buildFailureReportIssueUrl(
      "jonocodes/savr-failure-reports",
      { ...payload, error: { ...payload.error, detail: "x".repeat(20000) } },
      { maxUrlLength: 2000 }
    );

    expect(url.length).toBeLessThanOrEqual(2000);

    const json = parseIssueBodyPayload(url);
    expect(json.url).toBe("https://example.com/article");
    expect(json.error.message).toBe("Failed to download article");
    expect(json.error.detail!.length).toBeGreaterThan(0);
    expect(json.error.detail!.length).toBeLessThan(20000);
    expect(json.browser.userAgent).toBe("Mozilla/5.0 (Test)");
  });

  it("drops the error detail and truncates the user agent when needed", () => {
    const url = buildFailureReportIssueUrl(
      "jonocodes/savr-failure-reports",
      {
        ...payload,
        error: { ...payload.error, detail: "x".repeat(20000) },
        browser: { userAgent: "y".repeat(20000) },
      },
      { maxUrlLength: 900 }
    );

    expect(url.length).toBeLessThanOrEqual(900);

    const json = parseIssueBodyPayload(url);
    expect(json.url).toBe("https://example.com/article");
    expect(json.error.message).toBe("Failed to download article");
    expect(json.error.detail).toBeUndefined();
    expect(json.browser.userAgent!.length).toBeLessThan(20000);
  });

  it("shortens an oversized article url so the link stays within the limit", () => {
    const hugeUrl = `https://example.com/${"a".repeat(20000)}`;
    const url = buildFailureReportIssueUrl(
      "jonocodes/savr-failure-reports",
      { ...payload, url: hugeUrl },
      { maxUrlLength: 2000 }
    );

    expect(url.length).toBeLessThanOrEqual(2000);

    const json = parseIssueBodyPayload(url);
    expect(json.url.length).toBeLessThan(hugeUrl.length);
    expect(json.url.startsWith("https://example.com/")).toBe(true);
  });
});

function parseIssueBodyPayload(url: string): FailureReportPayload {
  const body = new URL(url).searchParams.get("body") ?? "";
  const json = body.split("```json\n")[1].split("\n```")[0];
  return JSON.parse(json) as FailureReportPayload;
}
