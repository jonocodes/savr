import {
  createExtensionImageSource,
  dataUrlToBlob,
  extensionDownloaderLabel,
  extensionFromMessageEvent,
  parseExtensionHandshake,
  type BridgeChannel,
} from "./extensionBridge";

/** An in-memory stand-in for the page's window message channel. */
function fakeChannel() {
  const listeners = new Set<(data: unknown) => void>();
  const posted: unknown[] = [];
  const channel: BridgeChannel = {
    post(message) {
      posted.push(message);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    channel,
    posted,
    listenerCount: () => listeners.size,
    reply(data: unknown) {
      for (const listener of [...listeners]) listener(data);
    },
  };
}

const PNG_DATA_URL = `data:image/png;base64,${Buffer.from("png bytes").toString("base64")}`;

describe("parseExtensionHandshake", () => {
  it("reads the version from the extension's reply to savr-ready", () => {
    expect(
      parseExtensionHandshake({
        action: "savr-html",
        source: "extension",
        extensionVersion: "1.0.0",
      })
    ).toEqual({ version: "1.0.0" });
  });

  it("ignores bookmarklet payloads", () => {
    expect(parseExtensionHandshake({ action: "savr-html", html: "<p>" })).toBeNull();
  });

  it("ignores an extension that predates the image bridge (no version)", () => {
    expect(parseExtensionHandshake({ action: "savr-html", source: "extension" })).toBeNull();
  });

  it.each([42, "", "1.0.0 <script>", "x".repeat(40), null])(
    "rejects a malformed version %p",
    (extensionVersion) => {
      expect(parseExtensionHandshake({ source: "extension", extensionVersion })).toBeNull();
    }
  );

  it("tolerates non-object data", () => {
    expect(parseExtensionHandshake(null)).toBeNull();
    expect(parseExtensionHandshake("savr-html")).toBeNull();
  });
});

describe("extensionDownloaderLabel", () => {
  it("names the extension version", () => {
    expect(extensionDownloaderLabel({ version: "1.2.3" })).toBe("extension 1.2.3");
  });
});

describe("dataUrlToBlob", () => {
  it("decodes a base64 image data URL", async () => {
    const blob = dataUrlToBlob(PNG_DATA_URL);
    expect(blob.type).toBe("image/png");
    expect(Buffer.from(await blob.arrayBuffer()).toString()).toBe("png bytes");
  });

  it("rejects non-image and non-base64 data URLs", () => {
    expect(() => dataUrlToBlob("data:text/html;base64,PGh0bWw+")).toThrow();
    expect(() => dataUrlToBlob("data:image/png,raw")).toThrow();
    expect(() => dataUrlToBlob("https://cdn.example/x.png")).toThrow();
  });
});

describe("createExtensionImageSource", () => {
  let nextId = 0;
  const newId = () => `req-${++nextId}`;

  beforeEach(() => {
    nextId = 0;
  });

  it("is labelled with the extension version", () => {
    const { channel } = fakeChannel();
    expect(createExtensionImageSource({ version: "1.0.0" }, { channel }).label).toBe(
      "extension 1.0.0"
    );
  });

  it("requests an image and resolves with the correlated reply", async () => {
    const fake = fakeChannel();
    const source = createExtensionImageSource({ version: "1.0.0" }, { channel: fake.channel, newId });

    const pending = source.fetchImage("https://cdn.example/a.png");
    expect(fake.posted).toEqual([
      { action: "savr-image-request", id: "req-1", url: "https://cdn.example/a.png" },
    ]);

    // Replies for other requests (and the app's own request echo) are ignored.
    fake.reply({ action: "savr-image-request", id: "req-1", url: "https://cdn.example/a.png" });
    fake.reply({ action: "savr-image-response", id: "someone-else", ok: false, error: "no" });
    fake.reply({ action: "savr-image-response", id: "req-1", ok: true, dataUrl: PNG_DATA_URL });

    const blob = await pending;
    expect(blob.type).toBe("image/png");
    expect(fake.listenerCount()).toBe(0);
  });

  it("keeps concurrent requests apart", async () => {
    const fake = fakeChannel();
    const source = createExtensionImageSource({ version: "1.0.0" }, { channel: fake.channel, newId });

    const first = source.fetchImage("https://cdn.example/1.png");
    const second = source.fetchImage("https://cdn.example/2.png");

    fake.reply({ action: "savr-image-response", id: "req-2", ok: false, error: "HTTP 403" });
    fake.reply({ action: "savr-image-response", id: "req-1", ok: true, dataUrl: PNG_DATA_URL });

    await expect(first).resolves.toBeInstanceOf(Blob);
    await expect(second).rejects.toThrow("HTTP 403");
  });

  it("times out when the extension never answers", async () => {
    jest.useFakeTimers();
    try {
      const fake = fakeChannel();
      const source = createExtensionImageSource(
        { version: "1.0.0" },
        { channel: fake.channel, newId, timeoutMs: 1000 }
      );

      const pending = source.fetchImage("https://cdn.example/slow.png");
      jest.advanceTimersByTime(1000);

      await expect(pending).rejects.toThrow("Extension did not answer within 1000 ms");
      expect(fake.listenerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it.each([
    ["missing ok flag", { dataUrl: PNG_DATA_URL }],
    ["missing bytes", { ok: true }],
    ["non-image bytes", { ok: true, dataUrl: "data:text/html;base64,PGh0bWw+" }],
  ])("rejects a malformed reply (%s)", async (_name, body) => {
    const fake = fakeChannel();
    const source = createExtensionImageSource({ version: "1.0.0" }, { channel: fake.channel, newId });

    const pending = source.fetchImage("https://cdn.example/a.png");
    fake.reply({ action: "savr-image-response", id: "req-1", ...body });

    await expect(pending).rejects.toThrow(/malformed reply/i);
  });
});

describe("extensionFromMessageEvent", () => {
  const win = { location: { origin: "https://savr.link" } } as unknown as Window;
  const data = { action: "savr-html", source: "extension", extensionVersion: "1.0.0" };

  it("accepts the handshake posted on the app's own window", () => {
    expect(
      extensionFromMessageEvent({ origin: "https://savr.link", source: win, data }, win)
    ).toEqual({ version: "1.0.0" });
  });

  it("ignores a handshake claimed by another origin (e.g. a bookmarklet page)", () => {
    expect(
      extensionFromMessageEvent({ origin: "https://evil.example", source: null, data }, win)
    ).toBeNull();
  });
});

describe("createExtensionImageSource after a timeout", () => {
  it("fails the remaining images fast instead of waiting on each", async () => {
    jest.useFakeTimers();
    try {
      const fake = fakeChannel();
      let id = 0;
      const source = createExtensionImageSource(
        { version: "1.0.0" },
        { channel: fake.channel, newId: () => `req-${++id}`, timeoutMs: 1000 }
      );

      const first = source.fetchImage("https://cdn.example/1.png");
      jest.advanceTimersByTime(1000);
      await expect(first).rejects.toThrow(/did not answer/);

      await expect(source.fetchImage("https://cdn.example/2.png")).rejects.toThrow(
        /stopped answering/
      );
      expect(fake.posted).toHaveLength(1);
    } finally {
      jest.useRealTimers();
    }
  });
});
