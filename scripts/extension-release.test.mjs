import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  addUpdate,
  checkTag,
  compareVersions,
  setInstallRedirect,
  sha256Of,
  INSTALL_PATH,
} from "./extension-release.mjs";

const ID = "savr@jonocodes.github.io";

function manifest(version) {
  return {
    version,
    browser_specific_settings: { gecko: { id: ID, strict_min_version: "142.0" } },
  };
}

const empty = { addons: { [ID]: { updates: [] } } };

test("compareVersions orders numerically, not lexically", () => {
  assert.ok(compareVersions("1.10.0", "1.9.2") > 0);
  assert.ok(compareVersions("1.0", "1.0.1") < 0);
  assert.equal(compareVersions("2.0.0", "2.0"), 0);
});

test("checkTag accepts ext-v<manifest version> only", () => {
  checkTag("ext-v1.2.3", manifest("1.2.3"));
  assert.throws(() => checkTag("ext-v1.2.4", manifest("1.2.3")), /does not match/);
  assert.throws(() => checkTag("v1.2.3", manifest("1.2.3")), /does not match/);
});

test("addUpdate writes the entry Firefox reads (applications.gecko, not browser_specific_settings)", () => {
  const result = addUpdate(empty, manifest("1.0.0"), {
    link: "https://example.test/savr-1.0.0.xpi",
    hash: "sha256:abc",
  });
  assert.deepEqual(result.addons[ID].updates, [
    {
      version: "1.0.0",
      update_link: "https://example.test/savr-1.0.0.xpi",
      update_hash: "sha256:abc",
      applications: { gecko: { strict_min_version: "142.0" } },
    },
  ]);
});

test("addUpdate keeps history sorted and refuses a reused version", () => {
  let updates = addUpdate(empty, manifest("1.10.0"), { link: "https://x/b", hash: "h" });
  updates = addUpdate(updates, manifest("1.9.0"), { link: "https://x/a", hash: "h" });
  assert.deepEqual(
    updates.addons[ID].updates.map((entry) => entry.version),
    ["1.9.0", "1.10.0"]
  );
  assert.throws(
    () => addUpdate(updates, manifest("1.9.0"), { link: "https://x/a", hash: "h" }),
    /already lists/
  );
});

test("addUpdate creates the add-on entry when missing", () => {
  const result = addUpdate({}, manifest("1.0.0"), { link: "https://x/a", hash: "h" });
  assert.equal(result.addons[ID].updates.length, 1);
});

test("setInstallRedirect replaces the install rule and keeps other rules", () => {
  const before = `/other  /elsewhere  301\n${INSTALL_PATH}  https://old  302\n`;
  assert.equal(
    setInstallRedirect(before, "https://new"),
    `/other  /elsewhere  301\n${INSTALL_PATH}  https://new  302\n`
  );
});

test("setInstallRedirect appends the rule when absent", () => {
  assert.equal(setInstallRedirect("", "https://new"), `${INSTALL_PATH}  https://new  302\n`);
  assert.equal(
    setInstallRedirect("/a  /b  301", "https://new"),
    `/a  /b  301\n${INSTALL_PATH}  https://new  302\n`
  );
});

test("sha256Of uses the sha256: prefix Firefox expects", () => {
  assert.equal(
    sha256Of(Buffer.from("")),
    "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
  );
});

test("the committed manifest, updates.json and _redirects agree", () => {
  const root = new URL("../", import.meta.url);
  const real = JSON.parse(readFileSync(new URL("browser-extension/manifest.json", root)));
  const gecko = real.browser_specific_settings.gecko;
  assert.equal(gecko.update_url, "https://savr.link/extension/updates.json");
  const updates = JSON.parse(readFileSync(new URL("public/extension/updates.json", root)));
  const entries = updates.addons[gecko.id].updates;
  assert.ok(Array.isArray(entries), "updates.json must list the add-on by its gecko id");
  for (const entry of entries) {
    assert.ok(entry.update_link.startsWith("https://"));
    assert.equal(entry.browser_specific_settings, undefined);
  }
  // A release bumps the manifest before it is published, so the newest listed
  // version may trail the manifest but never lead it.
  const newest = entries.at(-1);
  if (newest) assert.ok(compareVersions(newest.version, real.version) <= 0);
  const redirects = readFileSync(new URL("public/_redirects", root), "utf8");
  assert.ok(redirects.split("\n").some((line) => line.startsWith(`${INSTALL_PATH} `)));
});
