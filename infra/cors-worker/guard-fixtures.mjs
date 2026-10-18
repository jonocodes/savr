// Shared by the Node-shell and guarded-fetch tests (not itself a test file).
import http from "node:http";
import { isBlockedAddress } from "./ssrf-policy.js";

/**
 * A resolver with the `dns.lookup` signature that answers from a fixed table,
 * so no test depends on external DNS. Records every hostname asked for.
 */
export function fakeLookup(table) {
  const asked = [];
  const lookup = (hostname, options, callback) => {
    asked.push(hostname);
    const addresses = table[hostname];
    if (!addresses) {
      const error = new Error(`getaddrinfo ENOTFOUND ${hostname}`);
      error.code = "ENOTFOUND";
      process.nextTick(callback, error);
      return;
    }
    const records = addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
    if (options && options.all) process.nextTick(callback, null, records);
    else process.nextTick(callback, null, records[0].address, records[0].family);
  };
  return { lookup, asked };
}

/** A real local HTTP server that records the paths requested of it. */
export async function startServer(handler = (req, res) => res.end("internal secret")) {
  const hits = [];
  const server = http.createServer((req, res) => {
    hits.push(req.url);
    handler(req, res);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    hits,
    port: server.address().port,
    close() {
      server.closeAllConnections();
      return new Promise((resolve) => server.close(resolve));
    },
  };
}

// The only way a test can reach a local server through the guard: treat
// 127.0.0.1 as "public", and judge everything else by the real policy.
export const allowLoopbackForTest = (address) => address !== "127.0.0.1" && isBlockedAddress(address);

export const isBlockedError = (error) => error.code === "ERR_SSRF_BLOCKED";
