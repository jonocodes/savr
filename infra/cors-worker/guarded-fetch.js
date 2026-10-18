/**
 * Savr CORS proxy — a `fetch` for Node that refuses non-public addresses at
 * connect time.
 *
 * `core.js` only sees the target's hostname, and the platform `fetch` offers
 * no hook on the address it connects to, so a hostname resolving to a private
 * address (`127.0.0.1.nip.io`, attacker-controlled DNS) would pass. This fetch
 * runs on `node:http`/`node:https` with a guarded DNS `lookup`: every address a
 * hostname resolves to is checked against `ssrf-policy.js` before the socket
 * connects, so there is no gap between checking and connecting for DNS to
 * change in. IP-literal targets (which skip the lookup) are checked directly.
 *
 * It implements just what `core.js` needs: redirects are never followed (core
 * follows them itself, so every hop comes back through this guard), and bodies
 * are passed through as received — no `accept-encoding` is added and nothing is
 * decompressed, so `content-encoding`/`content-length` stay truthful.
 */

import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { Readable } from "node:stream";
import { isBlockedAddress } from "./ssrf-policy.js";

const DEFAULT_TIMEOUT_MS = 30_000;
// Matches core's MAX_BYTES. Core can only refuse an *advertised* oversize
// length; this also cuts off a chunked body that keeps growing.
const DEFAULT_MAX_BYTES = 25 * 1024 * 1024;

// Connection-level headers that describe the hop to us, not the resource.
const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "proxy-connection",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

function blockedError(host) {
  const error = new Error(`blocked non-public address for ${host}`);
  error.code = "ERR_SSRF_BLOCKED";
  return error;
}

/**
 * Wrap a `dns.lookup`-shaped resolver so it fails when *any* address the
 * hostname resolves to is blocked (an attacker can mix public and private
 * records). Keeps both callback shapes `net.connect` may ask for.
 */
export function createGuardedLookup({ lookup = dns.lookup, isBlocked = isBlockedAddress } = {}) {
  return function guardedLookup(hostname, options, callback) {
    if (typeof options === "function") {
      callback = options;
      options = {};
    } else if (typeof options === "number") {
      options = { family: options };
    }
    lookup(hostname, { ...options, all: true }, (error, records) => {
      if (error) return callback(error);
      if (!records || records.length === 0) {
        const notFound = new Error(`getaddrinfo ENOTFOUND ${hostname}`);
        notFound.code = "ENOTFOUND";
        return callback(notFound);
      }
      if (records.some((record) => isBlocked(record.address))) return callback(blockedError(hostname));
      if (options.all) return callback(null, records);
      return callback(null, records[0].address, records[0].family);
    });
  };
}

/**
 * Create a `fetch(url, { method, headers }) => Promise<Response>` whose
 * connections only ever reach public addresses.
 *
 * `lookup` (a `dns.lookup`-shaped resolver) and `isBlocked` are injectable for
 * tests; `timeoutMs` bounds socket inactivity, before and during the body;
 * `maxBytes` cuts the body off (the stream errors) once it exceeds the cap.
 */
export function createGuardedFetch({
  lookup = dns.lookup,
  isBlocked = isBlockedAddress,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxBytes = DEFAULT_MAX_BYTES,
} = {}) {
  const guardedLookup = createGuardedLookup({ lookup, isBlocked });
  // Own agents, so pooled sockets are never shared with code using another lookup.
  const agents = {
    "http:": new http.Agent({ keepAlive: true, lookup: guardedLookup }),
    "https:": new https.Agent({ keepAlive: true, lookup: guardedLookup }),
  };

  return function guardedFetch(input, init = {}) {
    return new Promise((resolve, reject) => {
      const url = new URL(String(input));
      const agent = agents[url.protocol];
      if (!agent) throw new Error(`unsupported protocol ${url.protocol}`);
      const literal = url.hostname.replace(/^\[|\]$/g, "");
      if (net.isIP(literal) && isBlocked(literal)) throw blockedError(url.hostname);

      const method = (init.method || "GET").toUpperCase();
      const headers = Object.fromEntries(new Headers(init.headers));
      const client = url.protocol === "https:" ? https : http;
      const request = client.request(url, { method, headers, agent, lookup: guardedLookup });

      request.setTimeout(timeoutMs, () => request.destroy(new Error("upstream timeout")));
      request.on("error", reject);
      request.on("response", (upstream) => {
        try {
          const responseHeaders = new Headers();
          const raw = upstream.rawHeaders;
          for (let i = 0; i < raw.length; i += 2) {
            if (!HOP_BY_HOP.has(raw[i].toLowerCase())) responseHeaders.append(raw[i], raw[i + 1]);
          }
          const status = upstream.statusCode;
          const bodyless = method === "HEAD" || status === 204 || status === 304;
          if (bodyless) upstream.resume();
          let received = 0;
          upstream.on("data", (chunk) => {
            received += chunk.length;
            if (received > maxBytes) upstream.destroy(new Error("response too large"));
          });
          resolve(
            new Response(bodyless ? null : Readable.toWeb(upstream), {
              status,
              statusText: upstream.statusMessage,
              headers: responseHeaders,
            })
          );
        } catch (error) {
          // e.g. a status outside 200–599, which Response refuses.
          upstream.destroy();
          reject(error);
        }
      });
      request.end();
    });
  };
}
