/**
 * Savr CORS proxy — portable core.
 *
 * A generic, read-only CORS proxy used by the Savr reader to fetch article
 * pages and images from hosts that don't send CORS headers. It can run open
 * (the shared public instance), locked behind one or more secret tokens, or
 * unconfigured (serves a setup page and refuses to proxy).
 *
 * Deliberately runtime-agnostic: `handleRequest` takes its cache and its
 * `waitUntil` from the caller, so the same code runs on Cloudflare Workers
 * (`worker.js`) and, later, on Deno Deploy. It is also deliberately open to
 * any *public* host, so it is hardened against the failure modes seen in
 * production:
 *
 *  - caching: upstream 404s sent `cache-control: no-cache`, so a client that
 *    retried a dead image re-fetched it forever (~234k requests in a day).
 *    We override the cache headers (200s immutable, errors short-lived) and
 *    cache at the edge so repeats don't hit the origin.
 *  - SSRF guard: only http(s); no private/loopback/link-local targets; every
 *    redirect is re-validated.
 *  - size cap: refuses oversized responses.
 *  - log hygiene: never logs the full `?url=` (it can contain API keys).
 *  - token auth: a locked proxy answers 404 (not 401) to a wrong or missing
 *    token, so it looks dead to scanners. Auth is checked before the edge
 *    cache, so a cache hit is never served without a token. The cache key is
 *    the target URL only, so rotating a token doesn't throw away the cache.
 */

export const PROXY_NAME = "savr-cors-proxy";
export const VERSION = "1.0.0";

const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64; rv:136.0) Gecko/20100101 Firefox/136.0";

const MAX_BYTES = 25 * 1024 * 1024; // 25 MiB
const MAX_REDIRECTS = 5;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Max-Age": "0",
};

// Content that never changes for a given URL can be cached aggressively; this
// is what stops a re-render from re-fetching the same image.
const IMMUTABLE_TYPE_PREFIXES = [
  "image/",
  "font/",
  "video/",
  "audio/",
  "text/css",
  "text/javascript",
  "application/javascript",
];

/** Split the `PROXY_TOKENS` secret ("a,b,c") into a trimmed, non-empty list. */
export function parseTokens(raw) {
  if (!raw) return [];
  return String(raw)
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);
}

function isPrivateIPv4(host) {
  const match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;
  const octets = match.slice(1).map(Number);
  if (octets.some((n) => n > 255)) return true; // malformed — block
  const [a, b] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT 100.64/10
    (a === 169 && b === 254) || // link-local
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224 // multicast / reserved
  );
}

function isPrivateIPv6(host) {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (h === "::1" || h === "::") return true;
  if (h.startsWith("fe80") || h.startsWith("fc") || h.startsWith("fd")) return true;
  const mapped = h.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return false;
}

/** Only public http(s) targets are allowed. */
function isBlockedTarget(url) {
  if (url.protocol !== "http:" && url.protocol !== "https:") return true;
  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return true;
  }
  if (host.includes(":")) return isPrivateIPv6(host);
  return isPrivateIPv4(host);
}

/** How long a response may be cached, by status and content type. */
function cacheControlFor(status, contentType) {
  const type = (contentType || "").toLowerCase();
  if (status === 200 || status === 203) {
    if (IMMUTABLE_TYPE_PREFIXES.some((prefix) => type.startsWith(prefix))) {
      return "public, max-age=31536000, immutable";
    }
    if (type.startsWith("text/html")) return "public, max-age=300";
    return "public, max-age=3600";
  }
  if (status === 404 || status === 410) return "public, max-age=3600";
  if (status >= 500) return "public, max-age=60";
  if (status >= 400) return "public, max-age=300";
  return "public, max-age=60";
}

/** Fetch, following redirects manually so each hop is SSRF-checked. */
async function safeFetch(target, method, headers) {
  let current = target;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const response = await fetch(current, { method, headers, redirect: "manual" });
    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      const next = new URL(location, current);
      if (isBlockedTarget(next)) throw new Error("blocked redirect target");
      current = next;
      continue;
    }
    return response;
  }
  throw new Error("too many redirects");
}

function withCors(response) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(CORS_HEADERS)) headers.set(name, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function plain(status, body) {
  return new Response(body, {
    status,
    headers: { ...CORS_HEADERS, "cache-control": "no-store" },
  });
}

function json(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}

/** A 404 identical to the worker's unknown-route 404: locked proxies look dead. */
function notFound() {
  return plain(404, "Not Found");
}

/**
 * Constant-time string comparison (length differences are folded in, so an
 * early length mismatch does not short-circuit). Prevents a token being
 * recovered character-by-character from response timing.
 */
function timingSafeEqual(a, b) {
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  let diff = aBytes.length ^ bBytes.length;
  const length = Math.max(aBytes.length, bBytes.length);
  for (let i = 0; i < length; i++) {
    diff |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
  }
  return diff === 0;
}

/**
 * True when `presented` matches any configured token. Every configured token
 * is compared (no early exit) so the number of tokens isn't leaked by timing.
 */
function isAuthorized(presented, tokens) {
  if (!presented) return false;
  let matched = false;
  for (const token of tokens) {
    if (timingSafeEqual(presented, token)) matched = true;
  }
  return matched;
}

function pathSegments(url) {
  return url.pathname.split("/").filter(Boolean);
}

function decodeSegment(segment) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * The token the caller presented: the `token` query parameter, or the first
 * path segment (`https://proxy.example/<token>/?url=…`). Both are shapes the
 * Savr app can produce by prefixing its target URL.
 */
function presentedToken(url, segments) {
  const queryToken = url.searchParams.get("token");
  if (queryToken) return queryToken;
  if (segments.length === 0) return "";
  if (segments[0] === "health") return "";
  return decodeSegment(segments[0]);
}

function isHealthPath(segments) {
  return segments.length > 0 && segments[segments.length - 1] === "health";
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Shown when neither `PUBLIC` nor `PROXY_TOKENS` is configured. A freshly
 * generated UUID is displayed each load: set it as the `PROXY_TOKENS` secret,
 * then paste the shown proxy URL into Savr. Until then, this worker refuses
 * to proxy anything — a forgotten deploy step can never leave an open proxy.
 */
function setupPage(request) {
  // Escape the origin: it is derived from the request Host header.
  const host = escapeHtml(new URL(request.url).origin);
  const token = globalThis.crypto.randomUUID();
  const proxyUrl = `${host}/${token}/?url=`;
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${PROXY_NAME} — not configured</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 44rem; margin: 3rem auto; padding: 0 1rem; line-height: 1.5; }
  code, pre { background: #f4f4f4; border-radius: 4px; padding: 0.15em 0.35em; word-break: break-all; }
  pre { padding: 0.75rem; overflow-x: auto; }
  h1 { font-size: 1.4rem; }
  .token { font-size: 1.05rem; }
</style>
</head>
<body>
<h1>${PROXY_NAME} is not configured yet</h1>
<p>This worker has no <code>PROXY_TOKENS</code> secret and is not marked public,
so it refuses to proxy anything.</p>
<ol>
  <li>
    <p>Set this freshly generated token as the worker secret:</p>
    <pre>npx wrangler secret put PROXY_TOKENS</pre>
    <p>When prompted, paste:</p>
    <pre class="token">${token}</pre>
  </li>
  <li>
    <p>Use this exact string as the CORS proxy in Savr (Preferences &rarr; CORS Proxy):</p>
    <pre class="token">${proxyUrl}</pre>
  </li>
</ol>
<p>Reloading this page generates a new token, so finish both steps before reloading.
You can rotate later by adding a second comma-separated token to the secret.</p>
</body>
</html>`;
  return new Response(html, {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

/**
 * Handle one request.
 *
 * `options`:
 *  - tokens: string[] — configured secret tokens (empty = not locked)
 *  - isPublic: boolean — the shared instance: open, no token required
 *  - cache: optional { match(Request), put(Request, Response) } edge cache
 *  - waitUntil: optional (promise) => void, to keep a cache write alive
 */
export async function handleRequest(request, options = {}) {
  const tokens = options.tokens ?? [];
  const isPublic = options.isPublic === true;
  const cache = options.cache ?? null;
  const waitUntil = options.waitUntil ?? (() => {});

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  const url = new URL(request.url);
  const segments = pathSegments(url);

  if (!isPublic && tokens.length === 0) {
    // Unconfigured. Never proxy; show the human how to lock it down.
    if (request.method !== "GET" && request.method !== "HEAD") {
      return plain(405, "Method not allowed");
    }
    return setupPage(request);
  }

  if (!isPublic) {
    const presented = presentedToken(url, segments);
    if (!isAuthorized(presented, tokens)) {
      // 404, not 401: a locked proxy should look dead to scanners.
      return notFound();
    }
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    return plain(405, "Method not allowed");
  }

  if (isHealthPath(segments)) {
    return json({
      name: PROXY_NAME,
      version: VERSION,
      authRequired: !isPublic && tokens.length > 0,
    });
  }

  const targetUrl = url.searchParams.get("url");
  if (!targetUrl) {
    return plain(400, "Missing 'url' parameter");
  }

  let target;
  try {
    target = new URL(targetUrl);
  } catch {
    return plain(400, "Invalid 'url' parameter");
  }
  if (isBlockedTarget(target)) {
    return plain(403, "Target not allowed");
  }

  // Auth was checked above, before this lookup, so a cache hit never bypasses
  // the token. The key is the target URL only, so rotation keeps the cache.
  const cacheKey = new Request(target.toString(), { method: "GET" });
  if (cache && request.method === "GET") {
    const hit = await cache.match(cacheKey);
    if (hit) return withCors(hit);
  }

  // Forward only what the target genuinely needs. In particular, never leak
  // the caller's cookies/authorization upstream.
  const headers = new Headers();
  for (const name of ["accept", "accept-language", "range"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (!headers.has("accept")) headers.set("accept", "*/*");
  headers.set("user-agent", USER_AGENT);

  let upstream;
  try {
    upstream = await safeFetch(target, request.method, headers);
  } catch (error) {
    // Log the host and error only, never the full URL (it may contain secrets).
    console.log(`proxy fetch failed host=${target.hostname} error=${error && error.message}`);
    return plain(502, "Upstream fetch failed");
  }

  const contentLength = Number(upstream.headers.get("content-length") || "0");
  if (contentLength > MAX_BYTES) {
    return plain(413, "Response too large");
  }

  const responseHeaders = new Headers(upstream.headers);
  for (const [name, value] of Object.entries(CORS_HEADERS)) {
    responseHeaders.set(name, value);
  }
  responseHeaders.set("Access-Control-Expose-Headers", "*");
  responseHeaders.set(
    "cache-control",
    cacheControlFor(upstream.status, upstream.headers.get("content-type"))
  );

  const response = new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });

  if (cache && request.method === "GET" && upstream.status < 500 && upstream.status !== 206) {
    waitUntil(cache.put(cacheKey, response.clone()));
  }

  return response;
}
