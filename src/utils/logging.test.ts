/**
 * Log entries must never persist a CORS proxy token (#84): diagnostic payloads
 * carry the resolved request URL, which includes the proxy prefix.
 */

jest.mock("~/config/environment", () => ({
  environmentConfig: { defaultCorsProxy: "https://default.example/?url=" },
}));

const add = jest.fn();
const count = jest.fn().mockResolvedValue(0);

jest.mock("~/utils/db", () => ({
  db: {
    transaction: jest.fn(async (_mode: string, _table: unknown, fn: () => Promise<void>) => fn()),
    logs: {
      add,
      count,
      orderBy: jest.fn(),
      bulkDelete: jest.fn(),
    },
  },
}));

import type { LogEntry } from "~/utils/db";
import { CORS_PROXY_STORAGE_KEY } from "./net/corsProxy";
import { formatLogsForCopy, recordLog } from "./logging";

const TOKEN = "11111111-2222-4333-8444-555555555555";
const PROXY = `https://proxy.example/${TOKEN}/?url=`;

function installLocalStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  (globalThis as { localStorage?: Storage }).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  } as unknown as Storage;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  delete (globalThis as { localStorage?: Storage }).localStorage;
  jest.clearAllMocks();
});

describe("recordLog", () => {
  it("masks a proxy token in the message and in nested meta", async () => {
    installLocalStorage({ [CORS_PROXY_STORAGE_KEY]: PROXY });
    const requestUrl = `${PROXY}${encodeURIComponent("https://example.com/a?apikey=SECRET")}`;

    recordLog("warn", "image", `Failed to download image: ${requestUrl}`, {
      slug: "my-article",
      requestUrl,
      status: 404,
      nested: { requestUrl },
    });
    await flush();

    expect(add).toHaveBeenCalledTimes(1);
    const entry = add.mock.calls[0][0];
    expect(entry.message).not.toContain(TOKEN);
    expect(entry.message).toContain("[redacted]");
    expect(entry.meta.requestUrl).not.toContain(TOKEN);
    expect(entry.meta.nested.requestUrl).not.toContain(TOKEN);
    expect(entry.meta.status).toBe(404);
    expect(entry.meta.slug).toBe("my-article");
  });

  it("leaves token-free entries unchanged", async () => {
    installLocalStorage();
    recordLog("error", "ingest", "Failed to download article", { url: "https://example.com/a" });
    await flush();

    const entry = add.mock.calls[0][0];
    expect(entry.message).toBe("Failed to download article");
    expect(entry.meta).toEqual({ url: "https://example.com/a" });
  });
});

describe("formatLogsForCopy", () => {
  it("masks entries captured before write-time masking existed", () => {
    installLocalStorage({ [CORS_PROXY_STORAGE_KEY]: PROXY });
    const requestUrl = `${PROXY}${encodeURIComponent("https://example.com/a")}`;
    const entry = {
      id: 1,
      timestamp: "2026-10-13T00:00:00.000Z",
      level: "warn",
      category: "image",
      message: `Failed to download image: ${requestUrl}`,
      meta: { requestUrl },
    } as LogEntry;

    const text = formatLogsForCopy([entry]);

    expect(text).not.toContain(TOKEN);
    expect(text).toContain("[redacted]");
  });
});
