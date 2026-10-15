#!/usr/bin/env node
/**
 * Release helpers for the self-hosted Firefox build of browser-extension/.
 *
 * Firefox finds updates through the manifest's `update_url`
 * (https://savr.link/extension/updates.json), which the hosted app serves from
 * `public/extension/updates.json`. The stable install link
 * (https://savr.link/extension/firefox.xpi) is a Netlify redirect in
 * `public/_redirects` to the newest signed XPI on GitHub Releases. Both files
 * are rewritten here, so a release only goes live for existing users once the
 * change lands on main and savr.link redeploys.
 *
 * Usage:
 *   node scripts/extension-release.mjs check-tag <tag>
 *   node scripts/extension-release.mjs publish --xpi <file> --link <url> [--manifest <file>]
 *
 * `--manifest` defaults to browser-extension/manifest.json; CI passes the
 * tagged commit's manifest so publishing onto a newer main records the version
 * that was actually signed.
 *
 * The pure functions are exported for scripts/extension-release.test.mjs.
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST_PATH = resolve(ROOT, "browser-extension/manifest.json");
const UPDATES_PATH = resolve(ROOT, "public/extension/updates.json");
const REDIRECTS_PATH = resolve(ROOT, "public/_redirects");

export const TAG_PREFIX = "ext-v";
export const INSTALL_PATH = "/extension/firefox.xpi";

/** Compare dotted numeric versions ("1.10.0" > "1.9.2"). */
export function compareVersions(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** Throw unless `tag` is `ext-v<manifest version>`. */
export function checkTag(tag, manifest) {
  const expected = `${TAG_PREFIX}${manifest.version}`;
  if (tag !== expected) {
    throw new Error(
      `Tag ${tag} does not match browser-extension/manifest.json version ` +
        `${manifest.version} (expected ${expected}).`
    );
  }
}

/**
 * Add a signed release to an update manifest. Entries stay sorted oldest
 * first. Version numbers are single-use on AMO, so a repeat is a mistake.
 *
 * Firefox only reads `applications` in update manifests — not
 * `browser_specific_settings` — so the min version goes there.
 */
export function addUpdate(updates, manifest, { link, hash }) {
  const id = manifest.browser_specific_settings.gecko.id;
  const minVersion = manifest.browser_specific_settings.gecko.strict_min_version;
  const existing = updates.addons?.[id]?.updates ?? [];
  if (existing.some((entry) => entry.version === manifest.version)) {
    throw new Error(`updates.json already lists version ${manifest.version}.`);
  }
  const entry = {
    version: manifest.version,
    update_link: link,
    update_hash: hash,
    applications: { gecko: { strict_min_version: minVersion } },
  };
  return {
    ...updates,
    addons: {
      ...updates.addons,
      [id]: {
        updates: [...existing, entry].sort((a, b) => compareVersions(a.version, b.version)),
      },
    },
  };
}

/** Point the stable install path at `link`, keeping every other rule. */
export function setInstallRedirect(redirects, link) {
  const rule = `${INSTALL_PATH}  ${link}  302`;
  const lines = redirects.split("\n");
  const index = lines.findIndex((line) => line.trim().split(/\s+/)[0] === INSTALL_PATH);
  if (index === -1) {
    const body = redirects.replace(/\n*$/, "");
    return (body ? `${body}\n` : "") + `${rule}\n`;
  }
  lines[index] = rule;
  return lines.join("\n");
}

export function sha256Of(buffer) {
  return `sha256:${createHash("sha256").update(buffer).digest("hex")}`;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function parseFlags(args) {
  const flags = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!args[i].startsWith("--")) throw new Error(`Unexpected argument: ${args[i]}`);
    flags[args[i].slice(2)] = args[i + 1];
  }
  return flags;
}

function main([command, ...args]) {
  if (command === "check-tag") {
    const manifest = readJson(MANIFEST_PATH);
    checkTag(args[0], manifest);
    console.log(`Tag matches manifest version ${manifest.version}.`);
    return;
  }
  if (command === "publish") {
    const { xpi, link, manifest: manifestPath = MANIFEST_PATH } = parseFlags(args);
    const manifest = readJson(manifestPath);
    if (!xpi || !link) throw new Error("publish needs --xpi <file> and --link <url>.");
    if (!link.startsWith("https://")) throw new Error("The update link must be HTTPS.");
    const hash = sha256Of(readFileSync(xpi));
    const updates = addUpdate(readJson(UPDATES_PATH), manifest, { link, hash });
    writeFileSync(UPDATES_PATH, JSON.stringify(updates, null, 2) + "\n");
    writeFileSync(REDIRECTS_PATH, setInstallRedirect(readFileSync(REDIRECTS_PATH, "utf8"), link));
    console.log(`Published ${manifest.version} (${hash}) → ${link}`);
    return;
  }
  throw new Error("Usage: extension-release.mjs check-tag <tag> | publish --xpi <file> --link <url> [--manifest <file>]");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
