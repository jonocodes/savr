/**
 * Savr — background (Firefox event page, Chrome service worker).
 *
 * Saving works like the bookmarklet, minus the opener: the extension opens the
 * app at `/?bookmarklet=<page url>` in a tab, the app announces `savr-ready` on
 * its own window once it is listening, and a bridge injected into that tab
 * replies with the scraped page as a `savr-html` message. The scrape itself
 * never touches the network — it clones the loaded DOM — so it works behind
 * logins and needs no CORS proxy for the page.
 *
 * YouTube watch pages are special-cased: the transcript extractor runs first
 * and, when it finds one, delivers raw content (`?rawIngest=1` → `savr-raw`)
 * exactly like the YouTube transcript bookmarklet.
 *
 * Delivery is queued in `storage.session` and retried when the app tab reports
 * `complete`, so a background context that is unloaded mid-save (Chrome
 * service workers are recycled aggressively) resumes instead of dropping the
 * payload.
 */

import {
  APP_URL_KEY,
  YOUTUBE_TRANSCRIPTS_KEY,
  hostPatternFor,
  normalizeAppUrl,
  resolveYoutubeTranscripts,
} from "./settings.js";
import { scrapeYouTubeTranscript } from "./youtube-transcript.js";

const api = globalThis.browser ?? globalThis.chrome;

const PENDING_DELIVERY_KEY = "pendingDelivery";

/* ------------------------------------------------------------------------ */
/* Settings                                                                  */
/* ------------------------------------------------------------------------ */

async function getAppUrl() {
  const stored = await api.storage.local.get(APP_URL_KEY);
  return normalizeAppUrl(stored[APP_URL_KEY]);
}

async function youtubeTranscriptsEnabled() {
  const stored = await api.storage.local.get(YOUTUBE_TRANSCRIPTS_KEY);
  return resolveYoutubeTranscripts(stored[YOUTUBE_TRANSCRIPTS_KEY]);
}

/* ------------------------------------------------------------------------ */
/* Injected functions (serialized into the page — self-contained)            */
/* ------------------------------------------------------------------------ */

/**
 * Runs in the article tab. Clones the loaded DOM and drops scripts and inline
 * event handlers before the page leaves the browser.
 */
function scrapePage() {
  const clone = document.documentElement.cloneNode(true);
  for (const script of clone.querySelectorAll("script")) {
    script.remove();
  }
  for (const element of clone.querySelectorAll("*")) {
    for (const attribute of Array.from(element.attributes)) {
      if (attribute.name.startsWith("on")) element.removeAttribute(attribute.name);
    }
  }
  return {
    url: window.location.href,
    html: "<!DOCTYPE html>\n" + clone.outerHTML,
  };
}

/**
 * Runs in the app tab. Waits for the app's `savr-ready` announcement, replies
 * once with the message, and stops listening.
 */
function deliverWhenReady(message) {
  let delivered = false;
  const onMessage = (event) => {
    if (!event.data || event.data.action !== "savr-ready") return;
    if (delivered) return;
    delivered = true;
    window.removeEventListener("message", onMessage);
    window.postMessage({ ...message, source: "extension" }, window.location.origin);
    console.info("[savr] delivered", message.action);
  };
  window.addEventListener("message", onMessage);
  console.info("[savr] delivery bridge listening");
  // Do not keep a listener alive forever if the app never announces itself.
  setTimeout(() => window.removeEventListener("message", onMessage), 5 * 60 * 1000);
}

/**
 * Runs in the app tab's isolated world (it needs `runtime.sendMessage`, which
 * the page world lacks). Relays the app's `savr-image-request` messages to the
 * background, which fetches the image with the extension's host permissions —
 * CORS-exempt, no proxy — and posts the bytes back as `savr-image-response`,
 * matched by request id. Stops 10 minutes after the latest save that injected
 * it, so it never outlives the saves it serves.
 */
function startImageRelay() {
  const RELAY_LIFETIME_MS = 10 * 60 * 1000;
  const existing = globalThis.__savrImageRelay;
  if (existing) {
    // Already listening (an earlier save in this tab): just extend its life.
    clearTimeout(existing.stopTimer);
    existing.stopTimer = setTimeout(existing.stop, RELAY_LIFETIME_MS);
    return;
  }
  const runtime = (globalThis.browser ?? globalThis.chrome).runtime;
  const origin = window.location.origin;

  const onMessage = (event) => {
    const data = event.data;
    if (event.origin !== origin || !data || data.action !== "savr-image-request") return;
    if (typeof data.id !== "string" || typeof data.url !== "string") return;
    const reply = (body) =>
      window.postMessage({ action: "savr-image-response", id: data.id, ...body }, origin);
    runtime.sendMessage({ type: "FETCH_IMAGE", url: data.url }).then(
      (result) =>
        reply(
          result && result.ok
            ? { ok: true, dataUrl: result.dataUrl }
            : { ok: false, error: (result && result.error) || "No reply from the extension" }
        ),
      (error) => reply({ ok: false, error: String((error && error.message) || error) })
    );
  };
  window.addEventListener("message", onMessage);
  const stop = () => {
    window.removeEventListener("message", onMessage);
    globalThis.__savrImageRelay = undefined;
  };
  globalThis.__savrImageRelay = { stop, stopTimer: setTimeout(stop, RELAY_LIFETIME_MS) };
}

/**
 * Inject the bridge into the app tab. The page (MAIN) world is preferred: its
 * messages behave exactly like the bookmarklet's, which sidesteps the isolated
 * world's message quirks across browsers (Firefox 128+ and Chromium both
 * support MAIN). The isolated world stays as a fallback.
 *
 * The image relay goes in first, so it is listening before the payload (and
 * with it the app's first image request) arrives. The payload carries the
 * extension version only when the relay is in place — that is the handshake
 * the app uses to route images through the extension. If the relay cannot be
 * injected the save still goes ahead and the app uses its proxy as before.
 */
async function injectDeliveryBridge(tabId, message) {
  let delivered = message;
  try {
    await api.scripting.executeScript({ target: { tabId }, func: startImageRelay });
    delivered = { ...message, extensionVersion: api.runtime.getManifest().version };
  } catch (error) {
    console.warn("[savr] could not inject the image relay:", error);
  }

  const injection = { target: { tabId }, func: deliverWhenReady, args: [delivered] };
  try {
    await api.scripting.executeScript({ ...injection, world: "MAIN" });
    console.info("[savr] delivery bridge injected into app tab", tabId, message.action);
  } catch (error) {
    console.info("[savr] MAIN-world injection failed, retrying isolated:", error);
    await api.scripting.executeScript(injection);
    console.info("[savr] delivery bridge injected into app tab", tabId, message.action);
  }
}

/**
 * Site-specific extractors. A handler runs in the active tab before the generic
 * DOM scrape; a successful extraction is delivered as raw content (no
 * Readability), a failed one falls back to the scrape so Save never dead-ends.
 */
const SITE_HANDLERS = [
  {
    id: "youtube",
    matches: (url) => /^https:\/\/(www\.|m\.)?youtube\.com\/watch\b/.test(url),
    isEnabled: youtubeTranscriptsEnabled,
    extract: scrapeYouTubeTranscript,
  },
];

/** The first enabled site handler matching this URL, if any. */
async function findSiteHandler(url) {
  for (const handler of SITE_HANDLERS) {
    if (!handler.matches(url)) continue;
    if (handler.isEnabled && !(await handler.isEnabled())) continue;
    return handler;
  }
  return undefined;
}

/* ------------------------------------------------------------------------ */
/* Save flow                                                                 */
/* ------------------------------------------------------------------------ */

// Fast path for the common case (tab finishes loading while the background is
// still alive); `storage.session` is the resumable copy.
const pendingByTab = new Map();
const deliveriesInFlight = new Set();

async function queueDelivery(tabId, payload) {
  pendingByTab.set(tabId, payload);
  try {
    await api.storage.session.set({ [PENDING_DELIVERY_KEY]: { tabId, payload } });
  } catch (error) {
    console.warn("[savr] could not persist the pending save:", error);
  }
  void tryDeliver(tabId);
}

/** The pending payload for a tab, from memory or session storage. */
async function peekPending(tabId) {
  if (pendingByTab.has(tabId)) return pendingByTab.get(tabId);
  try {
    const stored = await api.storage.session.get(PENDING_DELIVERY_KEY);
    const pending = stored[PENDING_DELIVERY_KEY];
    if (pending && pending.tabId === tabId) return pending.payload;
  } catch (error) {
    console.warn("[savr] could not read the pending save:", error);
  }
  return null;
}

/** Drop the pending payload — after a successful injection, or a dead tab. */
async function clearPending(tabId) {
  pendingByTab.delete(tabId);
  try {
    const stored = await api.storage.session.get(PENDING_DELIVERY_KEY);
    if (stored[PENDING_DELIVERY_KEY]?.tabId === tabId) {
      await api.storage.session.remove(PENDING_DELIVERY_KEY);
    }
  } catch (error) {
    console.warn("[savr] could not clear the pending save:", error);
  }
}

/** Inject the delivery bridge once the app tab has finished loading. */
async function tryDeliver(tabId) {
  if (deliveriesInFlight.has(tabId)) return;

  let tab;
  try {
    tab = await api.tabs.get(tabId);
  } catch {
    await clearPending(tabId); // the tab is gone
    return;
  }
  if (!tab || tab.status !== "complete") return; // onUpdated will retry.

  deliveriesInFlight.add(tabId);
  try {
    const payload = await peekPending(tabId);
    if (!payload) return;
    await injectDeliveryBridge(tabId, payload);
    // Forget the payload only after the bridge is in the page. If injection
    // fails it stays queued for the next retry (tab reload or background
    // restart); a duplicate bridge after a crash is harmless because the app
    // stops announcing once the first payload arrives.
    await clearPending(tabId);
  } catch (error) {
    console.warn("[savr] could not inject the delivery bridge:", error);
  } finally {
    deliveriesInFlight.delete(tabId);
  }
}

/**
 * Open the app at the entry point for a delivery mode (`raw` → the raw-ingest
 * listener, anything else → the bookmarklet listener) and queue the message for
 * the injected bridge.
 */
async function openApp(mode, message) {
  const appUrl = await getAppUrl();
  const target =
    mode === "raw"
      ? `${appUrl}/?rawIngest=1`
      : `${appUrl}/?bookmarklet=${encodeURIComponent(message.url)}`;

  const appTab = await api.tabs.create({ url: target });
  if (appTab.id !== undefined) {
    console.info("[savr] opened app tab", appTab.id, "at", target);
    await queueDelivery(appTab.id, message);
  }
  return { ok: true, mode };
}

async function saveActivePage() {
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  if (!tab || tab.id === undefined) {
    return { ok: false, error: "No active tab to save." };
  }

  const handler = await findSiteHandler(tab.url ?? "");
  if (handler) {
    try {
      const [result] = await api.scripting.executeScript({
        target: { tabId: tab.id },
        func: handler.extract,
      });
      const extracted = result?.result;
      if (extracted?.ok) {
        return await openApp("raw", {
          action: "savr-raw",
          content: extracted.content,
          contentType: extracted.contentType,
          title: extracted.title,
          author: extracted.author ?? null,
          url: extracted.url,
        });
      }
    } catch (error) {
      console.warn("[savr] site extractor failed, falling back to the page scrape:", error);
    }
  }

  let page = null;
  try {
    const [result] = await api.scripting.executeScript({
      target: { tabId: tab.id },
      func: scrapePage,
    });
    page = result?.result;
  } catch {
    return {
      ok: false,
      error: "This page cannot be scraped (browser-internal pages are off limits).",
    };
  }
  if (!page || !page.html) {
    return { ok: false, error: "Could not read this page's content." };
  }

  const outcome = await openApp("html", {
    action: "savr-html",
    url: page.url,
    html: page.html,
  });
  // Tell the popup when a site-specific extraction came up empty, so the user
  // knows they got the page instead of the transcript.
  return handler ? { ...outcome, fallback: true } : outcome;
}

async function visitSavr() {
  const appUrl = await getAppUrl();
  const tabs = await api.tabs.query({ url: hostPatternFor(appUrl) });
  const existing = tabs.find((tab) => tab.id !== undefined);
  if (existing) {
    await api.tabs.update(existing.id, { active: true });
    if (existing.windowId !== undefined) {
      await api.windows.update(existing.windowId, { focused: true });
    }
    return;
  }
  await api.tabs.create({ url: appUrl });
}

/* ------------------------------------------------------------------------ */
/* Image downloads for the app                                               */
/* ------------------------------------------------------------------------ */

// Shorter than the app's per-request timeout (15 s), so a slow image is reported
// as a failure for that image rather than read by the app as a dead relay.
const IMAGE_FETCH_TIMEOUT_MS = 10000;
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

/** Only the configured Savr app may ask the extension to download images. */
async function isFromSavrApp(sender) {
  const senderUrl = sender?.url ?? sender?.tab?.url;
  if (!senderUrl) return false;
  try {
    return new URL(senderUrl).origin === new URL(await getAppUrl()).origin;
  } catch {
    return false;
  }
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * Download an image with the extension's host permissions (CORS-exempt) and
 * return it as a data URL — runtime messages are JSON, so bytes travel as
 * base64. Cookies are never sent: this is a plain anonymous image fetch.
 */
async function fetchImageAsDataUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, error: "Invalid image URL" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: "Only http(s) images can be downloaded" };
  }

  const response = await fetch(parsed.href, {
    credentials: "omit",
    signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    return { ok: false, error: `HTTP ${response.status}` };
  }
  const contentType = (response.headers.get("content-type") ?? "").split(";")[0].trim();
  if (!contentType.startsWith("image/")) {
    return { ok: false, error: `Expected image content type, got: ${contentType || "none"}` };
  }
  if (Number(response.headers.get("content-length")) > MAX_IMAGE_BYTES) {
    return { ok: false, error: "Image too large" };
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > MAX_IMAGE_BYTES) {
    return { ok: false, error: "Image too large" };
  }
  return { ok: true, dataUrl: `data:${contentType};base64,${bytesToBase64(bytes)}` };
}

/* ------------------------------------------------------------------------ */
/* Wiring                                                                    */
/* ------------------------------------------------------------------------ */

api.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "complete") void tryDeliver(tabId);
});

api.tabs.onRemoved.addListener((tabId) => {
  void clearPending(tabId);
});

// Resume a delivery interrupted by a background unload.
void api.storage.session
  .get(PENDING_DELIVERY_KEY)
  .then((stored) => {
    const pending = stored[PENDING_DELIVERY_KEY];
    if (pending) void tryDeliver(pending.tabId);
  })
  .catch(() => {});

api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== "object") return undefined;

  if (message.type === "FETCH_IMAGE") {
    isFromSavrApp(sender)
      .then((allowed) =>
        allowed
          ? fetchImageAsDataUrl(String(message.url))
          : { ok: false, error: "Image requests are only accepted from the Savr app" }
      )
      .then(sendResponse, (error) =>
        sendResponse({ ok: false, error: String(error?.message ?? error) })
      );
    return true;
  }

  if (message.type === "SAVE_ACTIVE_PAGE") {
    saveActivePage().then(sendResponse, (error) =>
      sendResponse({ ok: false, error: String(error?.message ?? error) })
    );
    return true; // keep the channel open for the async response
  }

  if (message.type === "VISIT_SAVR") {
    visitSavr().then(
      () => sendResponse({ ok: true }),
      (error) => sendResponse({ ok: false, error: String(error?.message ?? error) })
    );
    return true;
  }

  return undefined;
});
