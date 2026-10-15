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
 *  - aggregate stats: one Analytics Engine point per non-preflight request
 *    (country, MIME class, status, cache outcome, caller app/class, and — on
 *    failures only — the host and fetch-error kind) so the stats worker
 *    (infra/cors-stats) can show usage without ever storing a URL.
 *    Preflights are skipped: protocol overhead, not usage.
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

/**
 * Coarse content class for statistics. The dashboard counts "articles" as
 * `html` fetches, so HTML must be distinguishable from the image/CSS/JS noise
 * a single article generates. Never stores or derives anything URL-specific.
 */
function mimeBucket(contentType) {
  const type = (contentType || "").split(";")[0].trim().toLowerCase();
  if (!type) return "none";
  if (type === "text/html" || type === "application/xhtml+xml") return "html";
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("audio/")) return "audio";
  if (type.startsWith("font/") || type.includes("font")) return "font";
  if (type === "text/css") return "css";
  if (type.includes("javascript")) return "js";
  if (type === "application/pdf") return "pdf";
  if (type === "application/json" || type.endsWith("+json")) return "json";
  if (type.includes("xml")) return "xml";
  if (type.startsWith("text/")) return "text";
  return "other";
}

/** Advertised response size, or -1 when unknown (chunked/streamed). */
function responseBytes(headers) {
  const value = Number(headers.get("content-length"));
  return Number.isFinite(value) && value >= 0 ? value : -1;
}

/**
 * Coarse caller-app identity: the Origin header's hostname, or its scheme for
 * non-web origins (`chrome-extension`, `capacitor`, …). It identifies the app,
 * never the person — no URL, no path, and extension ids are not stored.
 */
function callerOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return "";
  if (origin === "null") return "null";
  try {
    const url = new URL(origin);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.hostname.slice(0, 100);
    }
    return url.protocol.replace(":", "").slice(0, 40);
  } catch {
    return "invalid";
  }
}

/** Coarse client class from the UA; the raw UA is never stored. */
function clientClass(request) {
  const ua = request.headers.get("user-agent") || "";
  if (!ua) return "none";
  if (/bot|crawler|spider|slurp|curl|wget|python|go-http|okhttp|java|headless|node-fetch|axios|httpclient|libwww/i.test(ua)) {
    return "bot";
  }
  if (ua.startsWith("Mozilla/")) return "browser";
  return "other";
}

/** Why an upstream fetch failed, for the 502 breakdown. */
function fetchErrorKind(error) {
  const message = String((error && error.message) || "").toLowerCase();
  if (message.includes("blocked redirect")) return "blocked-redirect";
  if (message.includes("too many redirects")) return "redirect-loop";
  if (message.includes("timeout") || message.includes("timed out")) return "timeout";
  if (message.includes("dns") || message.includes("getaddrinfo") || message.includes("resolve")) return "dns";
  return "other";
}

/**
 * Record one aggregate data point (Analytics Engine, fire-and-forget). Blob
 * order is the schema — the stats worker queries blob1..blob8 positionally:
 *   blob1 country, blob2 MIME class, blob3 status, blob4 cache (hit/miss/
 *   bypass), blob5 host, blob6 caller origin, blob7 client class, blob8 fetch
 *   error kind. `host` is only ever passed for failures and `errorKind` only
 *   for 502s, mirroring the error-log hygiene. Streams are all tracked; there
 *   is no sampling here (AE samples adaptively on its own). Preflights are not
 *   recorded — they are protocol overhead, not usage.
 */
function recordStat(env, request, { status, contentType, cache, host, errorKind, bytes, startedAt }) {
  if (!env || !env.STATS) return;
  env.STATS.writeDataPoint({
    indexes: ["proxy"],
    blobs: [
      (request.cf && request.cf.country) || "XX",
      mimeBucket(contentType),
      String(status),
      cache || "",
      host || "",
      callerOrigin(request),
      clientClass(request),
      errorKind || "",
    ],
    doubles: [1, Date.now() - startedAt, bytes ?? -1],
  });
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
    const startedAt = Date.now();
    const respond = (body, status, fields = {}) => {
      recordStat(env, request, { status, startedAt, ...fields });
      return new Response(body, { status, headers: CORS_HEADERS });
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return respond("Method not allowed", 405, { cache: "bypass" });
    }

    const targetUrl = new URL(request.url).searchParams.get("url");
    if (!targetUrl) {
      return respond("Missing 'url' parameter", 400, { cache: "bypass" });
    }

    let target;
    try {
      target = new URL(targetUrl);
    } catch {
      return respond("Invalid 'url' parameter", 400, { cache: "bypass" });
    }
    if (isBlockedTarget(target)) {
      return respond("Target not allowed", 403, { cache: "bypass", host: target.hostname });
    }

    const cache = caches.default;
    const cacheKey = new Request(target.toString(), { method: "GET" });
    if (request.method === "GET") {
      const hit = await cache.match(cacheKey);
      if (hit) {
        recordStat(env, request, {
          status: hit.status,
          contentType: hit.headers.get("content-type"),
          cache: "hit",
          host: hit.status >= 400 ? target.hostname : "",
          bytes: responseBytes(hit.headers),
          startedAt,
        });
        return withCors(hit);
      }
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
      return respond("Upstream fetch failed", 502, {
        cache: "miss",
        host: target.hostname,
        errorKind: fetchErrorKind(error),
      });
    }

    const contentLength = Number(upstream.headers.get("content-length") || "0");
    if (contentLength > MAX_BYTES) {
      return respond("Response too large", 413, {
        contentType: upstream.headers.get("content-type"),
        cache: "miss",
        host: target.hostname,
        bytes: responseBytes(upstream.headers),
      });
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

    recordStat(env, request, {
      status: upstream.status,
      contentType: upstream.headers.get("content-type"),
      cache: request.method === "GET" ? "miss" : "bypass",
      host: upstream.status >= 400 ? target.hostname : "",
      bytes: responseBytes(upstream.headers),
      startedAt,
    });

    return response;
  },
};
