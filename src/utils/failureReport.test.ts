import { getFailureReportRepo } from "~/config/environment";
import {
  buildFailureReportPayload,
  buildIssueBody,
  buildIssueTitle,
  buildIssueUrl,
  isFailureReportConfigured,
  parseFailureReportPayload,
  type FailureReportPayload,
} from "./failureReport";

jest.mock("~/config/environment", () => ({
  BUILD_TIMESTAMP: "1970-01-01T00:00:00.000Z",
  getFailureReportRepo: jest.fn(),
}));

describe("buildFailureReportPayload", () => {
  it("captures url, error, app, browser, and reportedAt", () => {
    const payload = buildFailureReportPayload(
      "https://example.com/article",
      {
        category: "ingest",
        message: "Failed to download article",
        detail: "HTTP 403",
      },
      {
        buildTimestamp: "2026-09-20T00:00:00.000Z",
        mode: "pwa",
        origin: "https://deploy-preview-73--savrlist.netlify.app",
        userAgent: "Mozilla/5.0 (Test)",
        now: new Date("2026-09-20T12:34:56.000Z"),
      },
    );

    expect(payload).toEqual({
      url: "https://example.com/article",
      error: {
        category: "ingest",
        message: "Failed to download article",
        detail: "HTTP 403",
      },
      app: {
        buildTimestamp: "2026-09-20T00:00:00.000Z",
        mode: "pwa",
        origin: "https://deploy-preview-73--savrlist.netlify.app",
      },
      browser: { userAgent: "Mozilla/5.0 (Test)" },
      reportedAt: "2026-09-20T12:34:56.000Z",
    });
  });

  it("omits error.detail when the failure has no extra detail", () => {
    const payload = buildFailureReportPayload(
      "https://example.com/article",
      { category: "ingest", message: "Failed to download article" },
      { now: new Date(0) },
    );

    expect(payload.error).toEqual({
      category: "ingest",
      message: "Failed to download article",
    });
  });
});

const samplePayload: FailureReportPayload = {
  url: "https://example.com/article",
  error: { category: "ingest", message: "Failed to download article", detail: "HTTP 403" },
  app: {
    buildTimestamp: "2026-09-20T00:00:00.000Z",
    mode: "browser",
    origin: "https://savr.link",
  },
  browser: { userAgent: "Mozilla/5.0 (Test)" },
  reportedAt: "2026-09-20T12:34:56.000Z",
};

describe("buildIssueTitle", () => {
  it("names the host and the failure message", () => {
    expect(buildIssueTitle(samplePayload)).toBe(
      "[failed-url] example.com — Failed to download article",
    );
  });

  it("falls back to the raw url when it cannot be parsed", () => {
    const payload = { ...samplePayload, url: "not a url" };
    expect(buildIssueTitle(payload)).toBe(
      "[failed-url] not a url — Failed to download article",
    );
  });
});

describe("buildIssueBody", () => {
  it("wraps a readable payload in a collapsible diagnostic block", () => {
    const expectedJson = [
      "{",
      '  "url": "https://example.com/article",',
      '  "error": {',
      '    "category": "ingest",',
      '    "message": "Failed to download article",',
      '    "detail": "HTTP 403"',
      "  },",
      '  "app": {',
      '    "buildTimestamp": "2026-09-20T00:00:00.000Z",',
      '    "mode": "browser",',
      '    "origin": "https://savr.link"',
      "  },",
      '  "browser": {',
      '    "userAgent": "Mozilla/5.0 (Test)"',
      "  },",
      '  "reportedAt": "2026-09-20T12:34:56.000Z"',
      "}",
    ].join("\n");

    expect(buildIssueBody(samplePayload)).toBe(
      "Savr failed to load this article.\n" +
        "\n" +
        "**URL:** https://example.com/article\n" +
        "\n" +
        "<details>\n" +
        "<summary>Diagnostic details</summary>\n" +
        "\n" +
        "```json\n" +
        `${expectedJson}\n` +
        "```\n" +
        "\n" +
        "</details>",
    );
  });
});

describe("buildIssueUrl", () => {
  it("targets the repo's new-issue form with the encoded title and body", () => {
    const url = buildIssueUrl("jonocodes/savr-failure-reports", samplePayload);

    expect(url.startsWith("https://github.com/jonocodes/savr-failure-reports/issues/new?")).toBe(
      true,
    );
    const params = new URL(url).searchParams;
    expect(params.get("title")).toBe("[failed-url] example.com — Failed to download article");
    expect(params.get("body")).toBe(buildIssueBody(samplePayload));
    expect(params.get("labels")).toBe("failed-url");
  });

  it("round-trips title and body text containing URL-hostile characters", () => {
    const payload: FailureReportPayload = {
      ...samplePayload,
      url: "https://example.com/a?b=1&c=2#frag",
      error: { category: "ingest", message: "Failed to download article", detail: "a & b # c\nnew line" },
    };

    const params = new URL(buildIssueUrl("owner/repo", payload)).searchParams;
    const body = params.get("body") ?? "";
    expect(params.get("title")).toBe("[failed-url] example.com — Failed to download article");
    expect(body).toContain("**URL:** https://example.com/a?b=1&c=2#frag");
    expect(JSON.parse(body.split("```json\n")[1].split("\n```")[0]).error.detail).toBe(
      "a & b # c\nnew line",
    );
  });
});

function payloadFromBody(body: string): FailureReportPayload {
  return JSON.parse(body.split("```json\n")[1].split("\n```")[0]);
}

describe("buildIssueUrl trimming", () => {
  const withLongFields = (
    detail: string,
    userAgent: string,
    url: string = samplePayload.url,
  ): FailureReportPayload => ({
    ...samplePayload,
    url,
    error: { ...samplePayload.error, detail },
    browser: { userAgent },
  });

  // Big enough that a full 3000-char free-text field busts the URL budget,
  // without the required URL alone busting it.
  const crowdedUrl = `https://example.com/${"p".repeat(1780)}`;

  it("truncates an oversized error detail rather than dropping it", () => {
    const url = buildIssueUrl("owner/repo", withLongFields("d".repeat(3000), "u", crowdedUrl));
    const sent = payloadFromBody(new URL(url).searchParams.get("body") ?? "");

    expect(url.length).toBeLessThanOrEqual(6000);
    expect(sent.error.detail).toBeDefined();
    expect(sent.error.detail!.length).toBeLessThan(3000);
    expect(sent.browser.userAgent).toBe("u");
  });

  it("truncates an oversized user agent rather than dropping it", () => {
    const url = buildIssueUrl("owner/repo", withLongFields("d", "u".repeat(3000), crowdedUrl));
    const sent = payloadFromBody(new URL(url).searchParams.get("body") ?? "");

    expect(url.length).toBeLessThanOrEqual(6000);
    expect(sent.error.detail).toBe("d");
    expect(sent.browser.userAgent.length).toBeGreaterThan(0);
    expect(sent.browser.userAgent.length).toBeLessThan(3000);
  });

  it("drops free-text fields, keeping the required ones, when still oversized", () => {
    const longUrl = `https://example.com/${"p".repeat(2480)}`;
    const url = buildIssueUrl(
      "owner/repo",
      withLongFields("d".repeat(3000), "u".repeat(3000), longUrl),
    );
    const sent = payloadFromBody(new URL(url).searchParams.get("body") ?? "");

    expect(url.length).toBeLessThanOrEqual(6000);
    expect(sent.url).toBe(longUrl);
    expect(sent.error.message).toBe(samplePayload.error.message);
    expect(sent.reportedAt).toBe(samplePayload.reportedAt);
    expect(sent.error.detail ?? "").toBe("");
    expect(sent.browser.userAgent ?? "").toBe("");
  });
});

describe("parseFailureReportPayload", () => {
  it("accepts a user-edited payload", () => {
    const edited = {
      ...samplePayload,
      error: { ...samplePayload.error, message: "Edited by the reporter" },
    };

    expect(parseFailureReportPayload(JSON.stringify(edited, null, 2))).toEqual(edited);
  });

  it("rejects text that is not valid JSON", () => {
    expect(parseFailureReportPayload("{ not json")).toBeNull();
  });

  it("rejects JSON that is not a report payload", () => {
    expect(parseFailureReportPayload('{"hello":"world"}')).toBeNull();
  });

  it("rejects a payload whose reporter sections were removed", () => {
    const { app: _app, ...withoutApp } = samplePayload;
    const { browser: _browser, ...withoutBrowser } = samplePayload;
    const { reportedAt: _reportedAt, ...withoutReportedAt } = samplePayload;

    expect(parseFailureReportPayload(JSON.stringify(withoutApp))).toBeNull();
    expect(parseFailureReportPayload(JSON.stringify(withoutBrowser))).toBeNull();
    expect(parseFailureReportPayload(JSON.stringify(withoutReportedAt))).toBeNull();
  });

  it("rejects a payload whose url is not an http(s) URL", () => {
    expect(
      parseFailureReportPayload(JSON.stringify({ ...samplePayload, url: "javascript:alert(1)" })),
    ).toBeNull();
  });
});

describe("isFailureReportConfigured", () => {
  const repo = getFailureReportRepo as jest.Mock;

  it("is off when no repo was configured at build time", () => {
    repo.mockReturnValue("");
    expect(isFailureReportConfigured()).toBe(false);
  });

  it("is on when a repo was configured at build time", () => {
    repo.mockReturnValue("owner/repo");
    expect(isFailureReportConfigured()).toBe(true);
  });
});
