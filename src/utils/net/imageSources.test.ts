import {
  downloadImage,
  formatAttempts,
  ImageDownloadError,
  proxyDownloaderLabel,
  proxyImageSource,
  type ImageSource,
} from "./imageSources";
import { fetchWithTimeout } from "~/utils/article/tools";

const IMAGE_URL = "https://cdn.example/photo.jpg";

function source(label: string, result: Blob | Error): ImageSource & { calls: string[] } {
  const calls: string[] = [];
  return {
    label,
    calls,
    async fetchImage(url: string) {
      calls.push(url);
      if (result instanceof Error) throw result;
      return result;
    },
  };
}

const png = () => new Blob(["png bytes"], { type: "image/png" });

describe("proxyDownloaderLabel", () => {
  it("is 'direct' when no proxy is configured", () => {
    expect(proxyDownloaderLabel("")).toBe("direct");
  });

  it("names only the proxy hostname, never the token in the path", () => {
    const label = proxyDownloaderLabel(
      "https://my-worker.workers.dev/0b9e5c1e-3d2a-4c6b-9f1e-7a8b9c0d1e2f/?url="
    );
    expect(label).toBe("proxy my-worker.workers.dev");
  });

  it("drops a query-string token", () => {
    expect(proxyDownloaderLabel("https://proxy.example/?token=s3cret&url=")).toBe(
      "proxy proxy.example"
    );
  });

  it("drops credentials and the port", () => {
    expect(proxyDownloaderLabel("https://user:pass@proxy.example:8443/?url=")).toBe(
      "proxy proxy.example"
    );
  });

  it("does not echo a value that is not a URL", () => {
    expect(proxyDownloaderLabel("not a url s3cret")).toBe("proxy (unparsable)");
  });
});

describe("downloadImage", () => {
  it("uses the first source that supplies the bytes and skips the rest", async () => {
    const extension = source("extension 1.0.0", png());
    const proxy = source("proxy p.example", png());

    const result = await downloadImage(IMAGE_URL, [extension, proxy]);

    expect(result.source).toBe("extension 1.0.0");
    expect(result.attempts).toEqual([{ source: "extension 1.0.0", ok: true }]);
    expect(proxy.calls).toEqual([]);
  });

  it("falls back to the next source and records the chain", async () => {
    const extension = source("extension 1.0.0", new Error("timed out"));
    const proxy = source("proxy p.example", png());

    const result = await downloadImage(IMAGE_URL, [extension, proxy]);

    expect(result.source).toBe("proxy p.example");
    expect(result.attempts).toEqual([
      { source: "extension 1.0.0", ok: false, error: "timed out" },
      { source: "proxy p.example", ok: true },
    ]);
    expect(formatAttempts(result.attempts)).toBe(
      "extension 1.0.0 failed (timed out) -> proxy p.example ok"
    );
  });

  it("throws with every attempt when all sources fail", async () => {
    const extension = source("extension 1.0.0", new Error("no permission"));
    const direct = source("direct", new Error("HTTP 404"));

    const error = await downloadImage(IMAGE_URL, [extension, direct]).catch((e) => e);

    expect(error).toBeInstanceOf(ImageDownloadError);
    expect((error as ImageDownloadError).attempts).toEqual([
      { source: "extension 1.0.0", ok: false, error: "no permission" },
      { source: "direct", ok: false, error: "HTTP 404" },
    ]);
    expect((error as Error).message).toBe("HTTP 404");
  });
});

describe("proxyImageSource", () => {
  const mockedFetch = fetchWithTimeout as jest.Mock;

  afterEach(() => mockedFetch.mockReset());

  it("returns the body of an image response", async () => {
    const blob = png();
    mockedFetch.mockResolvedValue({
      ok: true,
      headers: { get: () => "image/png" },
      blob: async () => blob,
    });

    const imageSource = proxyImageSource("");
    expect(imageSource.label).toBe("direct");
    await expect(imageSource.fetchImage(IMAGE_URL)).resolves.toBe(blob);
    expect(mockedFetch).toHaveBeenCalledWith(IMAGE_URL);
  });

  it("rejects a non-image response", async () => {
    mockedFetch.mockResolvedValue({
      ok: true,
      headers: { get: () => "text/html" },
      blob: async () => new Blob(["<html>"]),
    });

    await expect(proxyImageSource("").fetchImage(IMAGE_URL)).rejects.toThrow(
      "Expected image content type, got: text/html"
    );
  });
});
