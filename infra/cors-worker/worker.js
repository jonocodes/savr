/**
 * Savr CORS proxy — Cloudflare Worker.
 *
 * A generic, read-only CORS proxy used by the Savr reader to fetch article
 * pages and images from hosts that don't send CORS headers. It is deliberately
 * open to any *public* host, so it is hardened against the failure modes seen
 * in production:
 *
 *  - caching: upstream 404s sent `cache-control: no-cache`, so a client that
 *    retried a dead image re-fetched it forever (~234k requests in a day).
 *    We override the cache headers (200s immutable, errors short-lived) and
 *    cache at the edge so repeats don't hit the origin.
 *  - SSRF guard: only http(s); no private/loopback/link-local targets; every
 *    redirect is re-validated.
 *  - size cap: refuses oversized responses.
 *  - log hygiene: never logs the full `?url=` (it can contain API keys).
 *
 * Deploy: `npx wrangler deploy` from this directory (see README.md).
 */

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

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
    }

    const targetUrl = new URL(request.url).searchParams.get("url");
    if (!targetUrl) {
      return new Response("Missing 'url' parameter", { status: 400, headers: CORS_HEADERS });
    }

    let target;
    try {
      target = new URL(targetUrl);
    } catch {
      return new Response("Invalid 'url' parameter", { status: 400, headers: CORS_HEADERS });
    }
    if (isBlockedTarget(target)) {
      return new Response("Target not allowed", { status: 403, headers: CORS_HEADERS });
    }

    const cache = caches.default;
    const cacheKey = new Request(target.toString(), { method: "GET" });
    if (request.method === "GET") {
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
      return new Response("Upstream fetch failed", { status: 502, headers: CORS_HEADERS });
    }

    const contentLength = Number(upstream.headers.get("content-length") || "0");
    if (contentLength > MAX_BYTES) {
      return new Response("Response too large", { status: 413, headers: CORS_HEADERS });
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

    if (request.method === "GET" && upstream.status < 500 && upstream.status !== 206) {
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
    }

    return response;
  },
};
