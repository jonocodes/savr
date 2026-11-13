/**
 * Public export: remotestoragejs >= 2.0.0-beta.10 made BaseClient.getItemURL
 * async. Dropbox resolves it to a share link; Google Drive rejects ("not
 * implemented"). The file is already stored by then, so the URL lookup must not
 * decide whether the publish succeeded.
 */

const storeFile = jest.fn();
const getItemURL = jest.fn();

jest.mock("../db", () => ({
  db: { articles: { toArray: jest.fn().mockResolvedValue([{ slug: "a" }]) } },
}));

jest.mock("../sync/storage", () => ({
  init: jest.fn(async () => ({
    remoteStorage: { scope: () => ({ storeFile, getItemURL }) },
  })),
}));

const STORAGE_KEY = "savr-public-export-state";
const store = new Map<string, string>();
(globalThis as { localStorage?: Storage }).localStorage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => {
    store.set(key, String(value));
  },
  removeItem: (key: string) => {
    store.delete(key);
  },
  clear: () => store.clear(),
  key: () => null,
  length: 0,
} as Storage;

import { getPublicExportState, publishNow } from "./publicExport";

function enableWith(extra: Record<string, unknown> = {}) {
  store.set(STORAGE_KEY, JSON.stringify({ enabled: true, dirty: true, ...extra }));
}

beforeEach(() => {
  store.clear();
  storeFile.mockReset().mockResolvedValue(undefined);
  getItemURL.mockReset();
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("publishNow", () => {
  it("records the URL that getItemURL resolves to", async () => {
    enableWith();
    getItemURL.mockResolvedValue("https://dropbox.example/s/abc/public-export.json");

    await publishNow();

    const state = getPublicExportState();
    expect(state.publicUrl).toBe("https://dropbox.example/s/abc/public-export.json");
    expect(state.dirty).toBe(false);
    expect(state.lastError).toBeUndefined();
  });

  it("still succeeds when the backend cannot produce a public URL", async () => {
    enableWith({ publicUrl: "https://previous.example/public-export.json" });
    getItemURL.mockRejectedValue(new Error("getItemURL is not implemented for Google Drive yet"));

    await publishNow();

    const state = getPublicExportState();
    expect(storeFile).toHaveBeenCalled();
    expect(state.dirty).toBe(false);
    expect(state.lastError).toBeUndefined();
    expect(state.lastPublishedAt).toBeDefined();
    expect(state.publicUrl).toBe("https://previous.example/public-export.json");
  });

  it("keeps the previous URL when getItemURL resolves to undefined", async () => {
    enableWith({ publicUrl: "https://previous.example/public-export.json" });
    getItemURL.mockResolvedValue(undefined);

    await publishNow();

    expect(getPublicExportState().publicUrl).toBe("https://previous.example/public-export.json");
  });

  it("marks the publish failed when the upload itself fails", async () => {
    enableWith();
    storeFile.mockRejectedValue(new Error("offline"));

    await expect(publishNow()).rejects.toThrow("offline");

    const state = getPublicExportState();
    expect(state.dirty).toBe(true);
    expect(state.lastError).toBe("offline");
    expect(getItemURL).not.toHaveBeenCalled();
  });
});
