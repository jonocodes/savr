import test from "node:test";
import assert from "node:assert/strict";
import { createGuardedFetch, createGuardedLookup } from "./guarded-fetch.js";
import { allowLoopbackForTest, fakeLookup, isBlockedError, startServer } from "./guard-fixtures.mjs";


test("refuses a hostname that resolves to loopback, before connecting", async () => {
  const server = await startServer();
  try {
    const { lookup, asked } = fakeLookup({ "rebind.test": ["127.0.0.1"] });
    const guardedFetch = createGuardedFetch({ lookup, timeoutMs: 1000 });
    await assert.rejects(guardedFetch(`http://rebind.test:${server.port}/secret`), isBlockedError);
    assert.deepEqual(asked, ["rebind.test"]);
    assert.deepEqual(server.hits, [], "the internal server must never be reached");
  } finally {
    await server.close();
  }
});

test("refuses hostnames resolving to private, link-local, metadata and embedded addresses", async () => {
  for (const address of [
    "10.0.0.1",
    "172.20.0.5",
    "192.168.1.1",
    "100.64.0.1",
    "169.254.169.254",
    "::1",
    "fe80::1",
    "fd00::1",
    "::ffff:127.0.0.1",
    "64:ff9b::a9fe:a9fe",
  ]) {
    const { lookup } = fakeLookup({ "evil.test": [address] });
    const guardedFetch = createGuardedFetch({ lookup, timeoutMs: 1000 });
    await assert.rejects(guardedFetch("http://evil.test/"), isBlockedError, address);
  }
});

test("refuses when any resolved address is blocked, not just the first", async () => {
  const { lookup } = fakeLookup({ "mixed.test": ["93.184.216.34", "127.0.0.1"] });
  const guardedFetch = createGuardedFetch({ lookup, timeoutMs: 1000 });
  await assert.rejects(guardedFetch("http://mixed.test/"), isBlockedError);
});

test("refuses blocked IP literals without a lookup, including forms core lets through", async () => {
  const server = await startServer();
  try {
    const { lookup, asked } = fakeLookup({});
    const guardedFetch = createGuardedFetch({ lookup, timeoutMs: 1000 });
    await assert.rejects(guardedFetch(`http://127.0.0.1:${server.port}/`), isBlockedError);
    await assert.rejects(guardedFetch(`http://[64:ff9b::7f00:1]:${server.port}/`), isBlockedError);
    assert.deepEqual(asked, []);
    assert.deepEqual(server.hits, []);
  } finally {
    await server.close();
  }
});

test("refuses non-http(s) targets", async () => {
  const guardedFetch = createGuardedFetch({ lookup: fakeLookup({}).lookup });
  await assert.rejects(guardedFetch("file:///etc/passwd"), isBlockedError);
});

test("the guarded lookup keeps both dns.lookup callback shapes", async () => {
  const { lookup } = fakeLookup({ "ok.test": ["93.184.216.34", "2606:2800:220:1::1"] });
  const guarded = createGuardedLookup({ lookup });
  const all = await new Promise((resolve, reject) =>
    guarded("ok.test", { all: true }, (error, records) => (error ? reject(error) : resolve(records)))
  );
  assert.deepEqual(all.map((record) => record.address), ["93.184.216.34", "2606:2800:220:1::1"]);
  const single = await new Promise((resolve, reject) =>
    guarded("ok.test", {}, (error, address, family) => (error ? reject(error) : resolve([address, family])))
  );
  assert.deepEqual(single, ["93.184.216.34", 4]);
});

test("an allowed address is fetched as a standard Response, redirects not followed", async () => {
  const server = await startServer((req, res) => {
    if (req.url === "/moved") {
      res.writeHead(302, { location: "http://elsewhere.test/" });
      res.end();
      return;
    }
    res.setHeader("set-cookie", ["a=1", "b=2"]);
    res.setHeader("content-type", "text/html");
    res.setHeader("x-seen-ua", req.headers["user-agent"] || "");
    res.end("<html>hello</html>");
  });
  try {
    const { lookup } = fakeLookup({ "public.test": ["127.0.0.1"] });
    const guardedFetch = createGuardedFetch({ lookup, isBlocked: allowLoopbackForTest, timeoutMs: 1000 });

    const response = await guardedFetch(`http://public.test:${server.port}/page`, {
      method: "GET",
      headers: new Headers({ "user-agent": "savr-test" }),
    });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "<html>hello</html>");
    assert.equal(response.headers.get("content-type"), "text/html");
    assert.equal(response.headers.get("x-seen-ua"), "savr-test");
    assert.deepEqual(response.headers.getSetCookie(), ["a=1", "b=2"]);
    assert.equal(response.headers.get("connection"), null, "hop-by-hop headers are dropped");
    assert.equal(response.headers.get("transfer-encoding"), null);

    const moved = await guardedFetch(`http://public.test:${server.port}/moved`, { redirect: "manual" });
    assert.equal(moved.status, 302);
    assert.equal(moved.headers.get("location"), "http://elsewhere.test/");

    const head = await guardedFetch(`http://public.test:${server.port}/page`, { method: "HEAD" });
    assert.equal(head.status, 200);
    assert.equal(head.body, null);
  } finally {
    await server.close();
  }
});

test("passes compressed bodies through untouched, with their encoding", async () => {
  const server = await startServer((req, res) => {
    res.writeHead(200, { "content-encoding": "gzip", "content-length": "4" });
    res.end(Buffer.from([1, 2, 3, 4]));
  });
  try {
    const { lookup } = fakeLookup({ "public.test": ["127.0.0.1"] });
    const guardedFetch = createGuardedFetch({ lookup, isBlocked: allowLoopbackForTest, timeoutMs: 1000 });
    const response = await guardedFetch(`http://public.test:${server.port}/`);
    assert.equal(response.headers.get("content-encoding"), "gzip");
    assert.equal(response.headers.get("content-length"), "4");
    assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [1, 2, 3, 4]);
  } finally {
    await server.close();
  }
});

test("times out a stalled upstream", async () => {
  const server = await startServer(() => {}); // never answers
  try {
    const { lookup } = fakeLookup({ "slow.test": ["127.0.0.1"] });
    const guardedFetch = createGuardedFetch({ lookup, isBlocked: allowLoopbackForTest, timeoutMs: 50 });
    await assert.rejects(guardedFetch(`http://slow.test:${server.port}/`), /timeout/);
  } finally {
    await server.close();
  }
});
