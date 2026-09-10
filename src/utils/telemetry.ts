// Anonymous, privacy-respecting usage telemetry.
//
// The canonical, user-facing description of what this collects lives in
// docs/TELEMETRY.md — keep its event table in sync when events change here.
//
// Goals (see docs/TELEMETRY.md):
//   - Answer "roughly how many people use Savr, from where, are they installing
//     it, and how are they capturing" — nothing more.
//   - Never send article URLs, titles, content, ids, or any account identity
//     (no RemoteStorage userAddress). Events are bare anonymous counts.
//   - Off unless a GoatCounter endpoint was configured at build time (so
//     self-hosters collect nothing), the user hasn't opted out, and the browser
//     isn't sending Global Privacy Control.
//
// Backed by GoatCounter (https://www.goatcounter.com), which is cookieless and
// has no persistent visitor id — country is derived server-side from the IP and
// the IP is discarded. Because there are no event properties, each dimension is
// encoded into the event name (e.g. "capture-bookmarklet").

import {
  getGoatCounterScriptUrl,
  getGoatCounterUrl,
  isTelemetryConfigured,
} from "~/config/environment";
import { getTelemetryEnabledFromCookie } from "~/utils/cookies";

interface GoatCounterCount {
  path: string;
  title?: string;
  event?: boolean;
}

declare global {
  interface Window {
    goatcounter?: {
      count?: (opts: GoatCounterCount) => void;
      no_onload?: boolean;
    };
  }
}

// Events fired before count.js finishes loading (e.g. app-open) are buffered
// here and flushed on load.
const pending: GoatCounterCount[] = [];
let initialized = false;
let scriptReady = false;

// The browser is sending Global Privacy Control — a deliberate, legally
// recognized (CCPA) "do not sell/share" signal. Respected regardless of the
// opt-out cookie so "on by default" stays honest.
//
// We intentionally do NOT honor the legacy DNT header: it's deprecated, widely
// ignored, frequently on by default without the user intending much by it, and
// the explicit Preferences opt-out already covers genuine consent. Honoring DNT
// here systematically under-counts Savr's privacy-conscious audience.
function privacySignalsOptOut(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  return nav.globalPrivacyControl === true;
}

/**
 * Whether the browser is sending Global Privacy Control. When true, telemetry is
 * suppressed regardless of the user's opt-out preference — the UI uses this to
 * show the Preferences toggle as disabled and explain why, rather than letting
 * it misleadingly read "on".
 */
export function hasGlobalPrivacyControl(): boolean {
  return privacySignalsOptOut();
}

// Whether telemetry may run right now: configured at build time + user consent +
// no browser privacy signal. Cheap enough to re-check on every event.
export function isTelemetryActive(): boolean {
  return (
    isTelemetryConfigured() &&
    getTelemetryEnabledFromCookie() &&
    !privacySignalsOptOut()
  );
}

// GoatCounter uses the event name as its "path", which cannot start with "/" and
// is cleanest as a slug. Keep names low-cardinality and free of any user data.
function sanitizeName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "unknown";
}

/**
 * Load the GoatCounter tracker (once) if telemetry is active. Safe to call on
 * every app start; a no-op when disabled. Automatic pageview counting is turned
 * off (no_onload) so we never log which article routes are visited — only the
 * explicit events below are sent.
 */
export function initTelemetry(): void {
  if (initialized) return;
  if (typeof document === "undefined") return;
  if (!isTelemetryActive()) return;
  initialized = true;

  window.goatcounter = { ...(window.goatcounter || {}), no_onload: true };

  const script = document.createElement("script");
  script.async = true;
  script.src = getGoatCounterScriptUrl();
  script.dataset.goatcounter = getGoatCounterUrl();
  script.addEventListener("load", () => {
    scriptReady = true;
    flush();
  });
  document.head.appendChild(script);
}

function flush(): void {
  if (!scriptReady || !window.goatcounter?.count) return;
  while (pending.length > 0) {
    const evt = pending.shift();
    if (evt) window.goatcounter.count(evt);
  }
}

/** Record a single anonymous event. No-op when telemetry is inactive. */
export function track(name: string, title?: string): void {
  if (!isTelemetryActive()) return;
  const evt: GoatCounterCount = { path: sanitizeName(name), title, event: true };
  if (scriptReady && window.goatcounter?.count) {
    window.goatcounter.count(evt);
  } else {
    pending.push(evt);
    // If init hasn't run yet (e.g. an event fired very early), kick it off.
    initTelemetry();
  }
}

// Running as an installed PWA? Covers Chromium/Android/desktop (display-mode)
// and iOS Safari (navigator.standalone) — the only reliable cross-platform
// install signal, since iOS never fires beforeinstallprompt/appinstalled.
function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    iosStandalone === true
  );
}

// --- Event helpers -------------------------------------------------------

/** Reach + geography, fired once per app load. Adds a standalone marker so we
 *  can compute the installed-vs-browser ratio. */
export function trackAppOpen(): void {
  track("app-open", "App open");
  if (isStandalone()) track("app-standalone", "App open (installed PWA)");
}

/** A successful capture, tagged by source: url | bookmarklet | paste | file. */
export function trackCapture(source: string): void {
  track(`capture-${sanitizeName(source)}`, "Article captured");
}

/** A capture that failed (e.g. CORS proxy down). No source/URL — bare count. */
export function trackCaptureFailed(): void {
  track("capture-failed", "Article capture failed");
}

/** PWA install prompt outcome (Chromium only). outcome: accepted | dismissed. */
export function trackPwaInstall(outcome: "accepted" | "dismissed"): void {
  track(`pwa-install-${outcome}`, "PWA install prompt");
}

/** Cloud sync connected. provider type only (dropbox | googledrive) — never the
 *  account address. */
export function trackSyncConnect(provider: string): void {
  track(`sync-connect-${sanitizeName(provider)}`, "Sync connected");
}
