// A production build must carry its own identity: `vite build` bakes the
// build's UTC timestamp in as __BUILD_TIMESTAMP__ (see lib/src/buildInfo.ts),
// which Preferences shows and every saved article records (#68). Jest can't
// see a Vite `define`, so this runs a real build and reads the bundle.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

function buildBundle(env) {
  const outDir = mkdtempSync(path.join(tmpdir(), "savr-build-stamp-"));
  try {
    const { VITE_BUILD_TIMESTAMP: _unset, ...rest } = process.env;
    execFileSync("npx", ["vite", "build", "--outDir", outDir, "--logLevel", "error"], {
      env: { ...rest, ...env },
      stdio: ["ignore", "ignore", "inherit"],
    });
    const jsDir = path.join(outDir, "js");
    return readdirSync(jsDir)
      .filter((f) => f.endsWith(".js"))
      .map((f) => readFileSync(path.join(jsDir, f), "utf8"))
      .join("\n");
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
}

test("a build stamps its own UTC time, to the second", () => {
  const before = Date.now();
  const bundle = buildBundle({});

  assert.ok(!bundle.includes("__BUILD_TIMESTAMP__"), "define left the constant unreplaced");
  const stamps = [...bundle.matchAll(/"(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)"/g)].map((m) => m[1]);
  const fresh = stamps.filter((s) => Date.parse(s) >= Math.floor(before / 1000) * 1000);
  assert.equal(fresh.length, 1, `expected one fresh build timestamp, found ${stamps}`);
});
