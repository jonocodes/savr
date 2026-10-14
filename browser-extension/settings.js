/**
 * Settings helpers shared by the background, the popup, and the options page.
 * The extension has no build step, so consumers import this module directly
 * (`"type": "module"` in the manifest background key).
 */

export const DEFAULT_APP_URL = "https://savr.link";
export const APP_URL_KEY = "savrAppUrl";

/**
 * Strict parse: null when `value` is not a usable http(s) address, so callers
 * can decide whether to fall back (background) or reject (options form).
 */
export function parseAppUrl(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    // The app is served from its origin's root, so any path is dropped.
    return url.origin;
  } catch {
    return null;
  }
}

/** The stored address with the default applied; never returns an invalid value. */
export function normalizeAppUrl(value) {
  return parseAppUrl(value) ?? DEFAULT_APP_URL;
}

/** Match pattern for an app URL's host — ports are not allowed in patterns. */
export function hostPatternFor(appUrl) {
  const url = new URL(appUrl);
  return `${url.protocol}//${url.hostname}/*`;
}
