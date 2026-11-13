import { downloadPage, PageDownloadError, proxyPageSource, type PageSource } from "./pageSources";
import { fetchWithTimeout } from "~/utils/article/tools";

const PAGE_URL = "https://news.example/story";

function source(label: string, result: Response | Error): PageSource & { calls: string[] } {
  const calls: string[] = [];
  return {
    label,
    calls,
    async fetchPage(url: string) {
      calls.push(url);
      if (result instanceof Error) throw result;
      return result;
    },
  };
}

const html = () => new Response("<html></html>", { headers: { "content-type": "text/html" } });

describe("downloadPage", () => {
  it("uses the first source that supplies the page and skips the rest", async () => {
    const extension = source("extension 1.0.0", html());
    const proxy = source("proxy p.example", html());

    const result = await downloadPage(PAGE_URL, [extension, proxy]);

    expect(result.source).toBe("extension 1.0.0");
    expect(result.attempts).toEqual([{ source: "extension 1.0.0", ok: true }]);
    expect(proxy.calls).toEqual([]);
  });

  it("falls back to the next source and records the chain", async () => {
    const extension = source("extension 1.0.0", new Error("no host permission"));
    const direct = source("direct", html());

    const result = await downloadPage(PAGE_URL, [extension, direct]);

    expect(result.source).toBe("direct");
    expect(result.attempts).toEqual([
      { source: "extension 1.0.0", ok: false, error: "no host permission" },
      { source: "direct", ok: true },
    ]);
  });

  it("throws with every attempt, keeping the last source's error as the cause", async () => {
    const proxyError = new Error("HTTP 404");
    const extension = source("extension 1.0.0", new Error("HTTP 404"));
    const proxy = source("proxy p.example", proxyError);

    const error = await downloadPage(PAGE_URL, [extension, proxy]).catch((e) => e);

    expect(error).toBeInstanceOf(PageDownloadError);
    expect((error as PageDownloadError).cause).toBe(proxyError);
    expect((error as PageDownloadError).attempts).toEqual([
      { source: "extension 1.0.0", ok: false, error: "HTTP 404" },
      { source: "proxy p.example", ok: false, error: "HTTP 404" },
    ]);
  });
});

describe("proxyPageSource", () => {
  const mockedFetch = fetchWithTimeout as jest.Mock;

  afterEach(() => mockedFetch.mockReset());

  it("is the governed proxy/direct fetch, named after the proxy", async () => {
    const response = html();
    mockedFetch.mockResolvedValue(response);

    const pageSource = proxyPageSource("https://p.example/?url=");
    expect(pageSource.label).toBe("proxy p.example");
    await expect(pageSource.fetchPage(PAGE_URL)).resolves.toBe(response);
    expect(mockedFetch).toHaveBeenCalledWith(PAGE_URL);
  });
});
