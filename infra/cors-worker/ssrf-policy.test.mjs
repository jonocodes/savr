import test from "node:test";
import assert from "node:assert/strict";
import { isBlockedAddress } from "./ssrf-policy.js";

test("blocks non-public IPv4 addresses", () => {
  for (const address of [
    "0.0.0.0",
    "0.1.2.3",
    "10.0.0.1",
    "100.64.0.1", // CGNAT
    "100.127.255.254",
    "127.0.0.1",
    "127.53.0.1",
    "169.254.169.254", // cloud metadata
    "172.16.0.1",
    "172.31.255.255",
    "192.0.0.8", // IETF protocol assignments
    "192.0.2.1", // TEST-NET-1
    "192.168.1.1",
    "198.18.0.1", // benchmarking
    "198.51.100.7", // TEST-NET-2
    "203.0.113.9", // TEST-NET-3
    "224.0.0.1", // multicast
    "240.0.0.1", // reserved
    "255.255.255.255",
  ]) {
    assert.equal(isBlockedAddress(address), true, address);
  }
});

test("allows public IPv4 addresses", () => {
  for (const address of [
    "1.1.1.1",
    "8.8.8.8",
    "93.184.216.34",
    "100.63.255.255", // just below CGNAT
    "100.128.0.1", // just above CGNAT
    "172.15.255.255",
    "172.32.0.1",
    "192.169.0.1",
    "223.255.255.254",
  ]) {
    assert.equal(isBlockedAddress(address), false, address);
  }
});

test("blocks non-public IPv6 addresses", () => {
  for (const address of [
    "::",
    "::1",
    "0:0:0:0:0:0:0:1",
    "fe80::1", // link-local
    "fe80::1%eth0", // with a zone id
    "febf::1",
    "fec0::1", // deprecated site-local
    "fc00::1", // unique local
    "fd12:3456::1",
    "ff02::1", // multicast
    "100::1", // discard
    "2001:db8::1", // documentation
    "2001:0:4136:e378::1", // Teredo
    "64:ff9b:1::1", // local-use NAT64
    "[::1]", // bracketed, as in a URL hostname
  ]) {
    assert.equal(isBlockedAddress(address), true, address);
  }
});

test("blocks IPv6 forms that embed a non-public IPv4 address", () => {
  for (const address of [
    "::ffff:127.0.0.1", // IPv4-mapped
    "::ffff:7f00:1", // IPv4-mapped, hex
    "::ffff:10.0.0.1",
    "::ffff:169.254.169.254",
    "::127.0.0.1", // IPv4-compatible
    "::a00:1",
    "::ffff:0:192.168.0.1", // SIIT
    "64:ff9b::127.0.0.1", // NAT64
    "64:ff9b::a9fe:a9fe", // NAT64 → 169.254.169.254
    "2002:7f00:1::1", // 6to4 of 127.0.0.1
    "2002:c0a8:101::", // 6to4 of 192.168.1.1
  ]) {
    assert.equal(isBlockedAddress(address), true, address);
  }
});

test("allows public IPv6 addresses, including ones embedding public IPv4", () => {
  for (const address of [
    "2606:4700:4700::1111",
    "2a00:1450:4001:80b::200e",
    "::ffff:8.8.8.8",
    "64:ff9b::808:808", // NAT64 → 8.8.8.8
    "2002:808:808::1", // 6to4 of 8.8.8.8
  ]) {
    assert.equal(isBlockedAddress(address), false, address);
  }
});

test("blocks anything that is not a well-formed IP address", () => {
  for (const address of [
    "",
    "localhost",
    "example.com",
    "256.0.0.1",
    "1.2.3",
    "01.2.3.4",
    "1:2:3:4:5:6:7:8:9",
    "1::2::3",
    "::fffff",
    undefined,
  ]) {
    assert.equal(isBlockedAddress(address), true, String(address));
  }
});
