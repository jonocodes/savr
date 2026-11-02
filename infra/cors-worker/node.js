/**
 * Savr CORS proxy — Node entry point, for self-hosting without Cloudflare.
 *
 * Thin wrapper around the portable core in `core.js`, like `worker.js`, plus
 * what Cloudflare's edge provided for free:
 *  - connect-time SSRF protection: upstream requests go through
 *    `guarded-fetch.js`, which refuses hostnames *resolving* to loopback,
 *    private, link-local or metadata addresses (core only checks the literal
 *    hostname, and a self-hosted box has a LAN to protect);
 *  - an HTTP server: `node:http` requests are handed to the core as standard
 *    `Request`s, and its `Response`s streamed back.
 *
 * No edge cache (an in-memory one is injectable via `createHandler`) and no
 * statistics. Configuration comes from the environment: `PROXY_TOKENS`,
 * `PUBLIC`, `ALLOWED_ORIGINS` (same meaning as on Cloudflare; see README.md),
 * plus `PORT` (default 8787) and `HOST` (default 0.0.0.0).
 *
 * Run: `node node.js`, or the Dockerfile / `docker compose up cors-proxy`.
 */

import http from "node:http";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { pathToFileURL } from "node:url";
import {
  PROXY_NAME,
  handleRequest,
  parseOriginPatterns,
  parsePublic,
  parseTokens,
  proxyMode,
} from "./core.js";
import { createGuardedFetch } from "./guarded-fetch.js";

/** The setup page's "set the secret" step for a self-hosted proxy. */
function envSecretStep(tokenHtml) {
  return `<p>Set this freshly generated token as <code>PROXY_TOKENS</code> in the proxy's
    environment (with Docker Compose, in the <code>.env</code> file next to
    <code>docker-compose.yml</code>), then restart the proxy:</p>
    <pre class="token">PROXY_TOKENS=${tokenHtml}</pre>`;
}

/**
 * Build a `(Request) => Promise<Response>` from environment-style config.
 * `fetch` defaults to the SSRF-guarded fetch; `cache` (a `{ match, put }`
 * pair, like Cloudflare's `caches.default`) defaults to none.
 */
export function createHandler(env = {}, { fetch = createGuardedFetch(), cache = null } = {}) {
  const options = {
    tokens: parseTokens(env.PROXY_TOKENS),
    isPublic: parsePublic(env.PUBLIC),
    allowedOrigins: parseOriginPatterns(env.ALLOWED_ORIGINS),
    cache,
    // Nothing to keep alive outside a worker; just never leave a rejection unhandled.
    waitUntil: (promise) =>
      promise.catch((error) => console.log(`cache write failed error=${error && error.message}`)),
    fetch,
    setupSecretStep: envSecretStep,
  };
  return (request) => handleRequest(request, options);
}

/**
 * A standard `Request` for an incoming `node:http` request. Only the URL,
 * method and headers matter: the proxy serves GET/HEAD/OPTIONS and never
 * reads a body. The scheme honours `X-Forwarded-Proto` so the setup page
 * shows `https://` behind a TLS-terminating reverse proxy.
 */
function toRequest(req) {
  const forwarded = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const scheme = forwarded === "https" || forwarded === "http" ? forwarded : "http";
  // Concatenate rather than resolve against a base: a path starting with `//`
  // must stay a path, not become a host.
  const url = new URL(`${scheme}://${req.headers.host || "localhost"}${req.url}`);
  const headers = new Headers();
  for (let i = 0; i < req.rawHeaders.length; i += 2) {
    const name = req.rawHeaders[i];
    if (name.toLowerCase() !== "host") headers.append(name, req.rawHeaders[i + 1]);
  }
  return new Request(url, { method: req.method, headers });
}

/** Stream a standard `Response` back over a `node:http` response. */
async function writeResponse(res, response) {
  const headers = {};
  for (const [name, value] of response.headers) {
    if (name === "set-cookie") continue;
    headers[name] = value;
  }
  const cookies = response.headers.getSetCookie();
  if (cookies.length > 0) headers["set-cookie"] = cookies;
  res.writeHead(response.status, response.statusText || undefined, headers);
  if (!response.body) {
    res.end();
    return;
  }
  // pipeline tears the upstream down if the client goes away mid-body.
  await pipeline(Readable.fromWeb(response.body), res);
}

/** An `http.Server` that serves `handler` (a `(Request) => Promise<Response>`). */
export function createServer(handler) {
  return http.createServer(async (req, res) => {
    let response;
    try {
      response = await handler(toRequest(req));
    } catch (error) {
      console.log(`request failed error=${error && error.message}`);
      response = new Response("Internal error", {
        status: 500,
        headers: { "access-control-allow-origin": "*", "cache-control": "no-store" },
      });
    }
    try {
      await writeResponse(res, response);
    } catch {
      // The client went away, or the upstream body failed mid-stream.
      res.destroy();
    }
  });
}

function main() {
  const port = Number(process.env.PORT || 8787);
  const host = process.env.HOST || "0.0.0.0";
  const server = createServer(createHandler(process.env));
  server.listen(port, host, () => {
    const mode = proxyMode({
      tokens: parseTokens(process.env.PROXY_TOKENS),
      isPublic: parsePublic(process.env.PUBLIC),
    });
    const label = mode === "unconfigured" ? "unconfigured (serving the setup page)" : mode;
    console.log(`${PROXY_NAME} listening on http://${host}:${port} — ${label}`);
  });
  // Exit promptly on `docker stop` (PID 1 gets no default SIGTERM handling).
  for (const signal of ["SIGTERM", "SIGINT"]) {
    process.on(signal, () => {
      server.close(() => process.exit(0));
      server.closeIdleConnections();
      setTimeout(() => process.exit(0), 5000).unref();
    });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
