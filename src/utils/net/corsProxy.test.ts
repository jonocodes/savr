/**
 * Tests for the CORS proxy setting (#84): localStorage storage with cookie
 * migration, and masking of any token before it reaches logs or reports.
 */

jest.mock("~/config/environment", () => ({
  environmentConfig: { defaultCorsProxy: "https://default.example/?url=" },
}));

import {
  buildProxiedUrl,
  CORS_PROXY_STORAGE_KEY,
  getCorsProxyValue,
  getStoredCorsProxy,
  maskCorsProxyInText,
  setStoredCorsProxy,
} from "./corsProxy";

const PATH_TOKEN = "11111111-2222-4333-8444-555555555555";
const PATH_PROXY = `https://proxy.example/${PATH_TOKEN}/?url=`;
const QUERY_TOKEN = "supersecret-token-value";
const QUERY_PROXY = `https://proxy.example/?token=${QUERY_TOKEN}&url=`;

function installLocalStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  const stub = {
    get length() {
      return store.size;
    },
    key: (index: number) => [...store.keys()][index] ?? null,
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
  } as unknown as Storage;
  (globalThis as { localStorage?: Storage }).localStorage = stub;
  return store;
}

function installDocumentCookie(initial: string) {
  const doc = { cookie: initial };
  (globalThis as { document?: { cookie: string } }).document = doc;
  return doc;
}

afterEach(() => {
  delete (globalThis as { localStorage?: Storage }).localStorage;
  delete (globalThis as { document?: { cookie: string } }).document;
});

describe("proxy setting storage", () => {
  it("round-trips a stored proxy", () => {
    const store = installLocalStorage();
    setStoredCorsProxy(PATH_PROXY);
    expect(store.get(CORS_PROXY_STORAGE_KEY)).toBe(PATH_PROXY);
    expect(getStoredCorsProxy()).toBe(PATH_PROXY);
    expect(getCorsProxyValue()).toBe(PATH_PROXY);
  });

  it("trims the value and clears the entry on null/empty", () => {
    const store = installLocalStorage();
    setStoredCorsProxy(`  ${PATH_PROXY}  `);
    expect(store.get(CORS_PROXY_STORAGE_KEY)).toBe(PATH_PROXY);

    setStoredCorsProxy("   ");
    expect(store.has(CORS_PROXY_STORAGE_KEY)).toBe(false);
    expect(getStoredCorsProxy()).toBeNull();
  });

  it("falls back to the build-time default when nothing is stored", () => {
    installLocalStorage();
    expect(getStoredCorsProxy()).toBeNull();
    expect(getCorsProxyValue()).toBe("https://default.example/?url=");
  });

  it("migrates a legacy cookie into localStorage and deletes the cookie", () => {
    const store = installLocalStorage();
    const doc = installDocumentCookie(`other=1; savr-cors-proxy=${encodeURIComponent(PATH_PROXY)}`);

    expect(getStoredCorsProxy()).toBe(PATH_PROXY);
    expect(store.get(CORS_PROXY_STORAGE_KEY)).toBe(PATH_PROXY);
    expect(doc.cookie).toContain("expires=Thu, 01 Jan 1970");
    expect(doc.cookie).not.toContain(PATH_TOKEN);
  });

  it("does not rewrite the cookie when a value is set", () => {
    const store = installLocalStorage();
    const doc = installDocumentCookie("");

    setStoredCorsProxy(PATH_PROXY);

    expect(store.get(CORS_PROXY_STORAGE_KEY)).toBe(PATH_PROXY);
    expect(doc.cookie).not.toContain(PATH_TOKEN);
  });
});

describe("buildProxiedUrl", () => {
  // Both shapes are exactly what the worker's token auth accepts (#84).
  it("builds the path-token request URL", () => {
    expect(buildProxiedUrl("https://example.com/a?b=1", PATH_PROXY)).toBe(
      `${PATH_PROXY}${encodeURIComponent("https://example.com/a?b=1")}`,
    );
  });

  it("builds the query-token request URL", () => {
    expect(buildProxiedUrl("https://example.com/a", QUERY_PROXY)).toBe(
      `${QUERY_PROXY}https%3A%2F%2Fexample.com%2Fa`,
    );
  });

  it("fetches the target directly when there is no proxy", () => {
    expect(buildProxiedUrl("https://example.com/a", "")).toBe("https://example.com/a");
  });
});

describe("maskCorsProxyInText", () => {
  it("masks a UUID path-segment token in a proxied request URL", () => {
    installLocalStorage({ [CORS_PROXY_STORAGE_KEY]: PATH_PROXY });
    const requestUrl = `${PATH_PROXY}${encodeURIComponent("https://example.com/article")}`;

    const masked = maskCorsProxyInText(requestUrl);

    expect(masked).not.toContain(PATH_TOKEN);
    expect(masked).toContain("[redacted]");
    expect(masked).toContain("example.com");
  });

  it("masks a token= query parameter", () => {
    installLocalStorage({ [CORS_PROXY_STORAGE_KEY]: QUERY_PROXY });
    const requestUrl = `${QUERY_PROXY}${encodeURIComponent("https://example.com/article")}`;

    const masked = maskCorsProxyInText(requestUrl);

    expect(masked).not.toContain(QUERY_TOKEN);
    expect(masked).toContain("token=[redacted]");
  });

  it("is a no-op for the token-free default proxy", () => {
    installLocalStorage();
    const requestUrl = `https://default.example/?url=${encodeURIComponent("https://example.com/a")}`;
    expect(maskCorsProxyInText(requestUrl)).toBe(requestUrl);
  });

  it("masks a token that appears on its own elsewhere in the text", () => {
    installLocalStorage({ [CORS_PROXY_STORAGE_KEY]: PATH_PROXY });
    expect(maskCorsProxyInText(`token ${PATH_TOKEN} leaked`)).toBe("token [redacted] leaked");
  });
});
