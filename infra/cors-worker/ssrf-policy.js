/**
 * Savr CORS proxy — which resolved IP addresses a proxy may connect to.
 *
 * `core.js` refuses private *literal* hostnames, which is enough on Cloudflare's
 * edge (there is no LAN to reach). A self-hosted proxy also has to check the
 * address a hostname *resolves* to, at connect time, or `127.0.0.1.nip.io` (or
 * any attacker-controlled DNS) reaches the host's own network. This module is
 * the address policy for that check: pure JS, no runtime APIs, so every
 * non-Cloudflare shell (Node now, Deno later) can share it. `guarded-fetch.js`
 * applies it to Node's DNS lookups.
 *
 * Anything that is not a well-formed IP address is blocked.
 */

/** Parse dotted-quad IPv4 into four octets, or null. Leading zeros are refused (octal ambiguity). */
function parseIPv4(text) {
  const parts = text.split(".");
  if (parts.length !== 4) return null;
  const octets = [];
  for (const part of parts) {
    if (!/^(0|[1-9]\d{0,2})$/.test(part)) return null;
    const value = Number(part);
    if (value > 255) return null;
    octets.push(value);
  }
  return octets;
}

/** Parse IPv6 (optionally bracketed, with a zone id) into eight 16-bit groups, or null. */
function parseIPv6(text) {
  let h = text.replace(/^\[|\]$/g, "").toLowerCase();
  h = h.replace(/%.*$/, "");
  // A trailing dotted quad stands for the last two groups.
  const dotted = h.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    const octets = parseIPv4(dotted[2]);
    if (!octets) return null;
    const high = ((octets[0] << 8) | octets[1]).toString(16);
    const low = ((octets[2] << 8) | octets[3]).toString(16);
    h = `${dotted[1]}${high}:${low}`;
  }
  const halves = h.split("::");
  if (halves.length > 2) return null;
  const toGroups = (part) => (part === "" ? [] : part.split(":"));
  const head = toGroups(halves[0]);
  const tail = halves.length === 2 ? toGroups(halves[1]) : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 2 ? missing < 1 : missing !== 0) return null;
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill("0"), ...tail];
  const values = [];
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
    values.push(parseInt(group, 16));
  }
  return values;
}

function isBlockedIPv4([a, b, c]) {
  return (
    a === 0 || // "this network"
    a === 10 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT 100.64/10
    a === 127 ||
    (a === 169 && b === 254) || // link-local, incl. cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) || // IETF protocol assignments
    (a === 192 && b === 0 && c === 2) || // TEST-NET-1
    (a === 192 && b === 88 && c === 99) || // 6to4 relay anycast
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    (a === 198 && b === 51 && c === 100) || // TEST-NET-2
    (a === 203 && b === 0 && c === 113) || // TEST-NET-3
    a >= 224 // multicast, reserved, broadcast
  );
}

/** The IPv4 address in groups[i] and groups[i + 1]. */
function embeddedIPv4(groups, i) {
  return [groups[i] >> 8, groups[i] & 0xff, groups[i + 1] >> 8, groups[i + 1] & 0xff];
}

function isBlockedIPv6(g) {
  const zeroUpTo = (n) => g.slice(0, n).every((value) => value === 0);
  // ::/96 (IPv4-compatible, incl. :: and ::1) and ::ffff:0:0/96 (IPv4-mapped)
  // and ::ffff:0:0:0/96 (SIIT): judge the embedded IPv4 address.
  if (zeroUpTo(6)) return isBlockedIPv4(embeddedIPv4(g, 6));
  if (zeroUpTo(5) && g[5] === 0xffff) return isBlockedIPv4(embeddedIPv4(g, 6));
  if (zeroUpTo(4) && g[4] === 0xffff && g[5] === 0) return isBlockedIPv4(embeddedIPv4(g, 6));
  // NAT64 well-known prefix 64:ff9b::/96 translates to the embedded IPv4.
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((v) => v === 0)) {
    return isBlockedIPv4(embeddedIPv4(g, 6));
  }
  if (g[0] === 0x64 && g[1] === 0xff9b && g[2] === 1) return true; // local-use NAT64 64:ff9b:1::/48
  if (g[0] === 0x2002) return isBlockedIPv4(embeddedIPv4(g, 1)); // 6to4 2002::/16
  if (g[0] === 0x2001 && g[1] === 0) return true; // Teredo 2001::/32 (tunnels to any IPv4)
  if (g[0] === 0x2001 && g[1] === 0xdb8) return true; // documentation
  if (g[0] === 0x100 && g.slice(1, 4).every((v) => v === 0)) return true; // discard 100::/64
  if ((g[0] & 0xfe00) === 0xfc00) return true; // unique local fc00::/7
  if ((g[0] & 0xffc0) === 0xfe80) return true; // link-local fe80::/10
  if ((g[0] & 0xffc0) === 0xfec0) return true; // site-local fec0::/10 (deprecated)
  if ((g[0] & 0xff00) === 0xff00) return true; // multicast
  return false;
}

/**
 * True when a proxy must not connect to `address` (an IPv4 or IPv6 literal, as
 * returned by a DNS lookup; brackets and zone ids are tolerated).
 */
export function isBlockedAddress(address) {
  if (typeof address !== "string") return true;
  const v4 = parseIPv4(address);
  if (v4) return isBlockedIPv4(v4);
  const v6 = parseIPv6(address);
  if (v6) return isBlockedIPv6(v6);
  return true;
}
