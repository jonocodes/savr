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

/**
 * Version of the payload shape the bridge delivers. The app and the extension
 * update on different schedules (savr.link deploys, extensions update daily,
 * self-hosted instances can lag far behind), so every payload says which shape
 * it is. Bump it only for a breaking change to the payload; the app treats a
 * payload without it as protocol 1.
 */
const BRIDGE_PROTOCOL = 1;

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
 * Inject the bridge into the app tab. The page (MAIN) world is preferred: its
 * messages behave exactly like the bookmarklet's, which sidesteps the isolated
 * world's message quirks across browsers (Firefox 128+ and Chromium both
 * support MAIN). The isolated world stays as a fallback.
 */
async function injectDeliveryBridge(tabId, message) {
  const injection = { target: { tabId }, func: deliverWhenReady, args: [message] };
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
    await queueDelivery(appTab.id, { ...message, protocol: BRIDGE_PROTOCOL });
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
    // Firefox for Android has no windows API; the tab switch is enough there.
    if (existing.windowId !== undefined && api.windows) {
      await api.windows.update(existing.windowId, { focused: true });
    }
    return;
  }
  await api.tabs.create({ url: appUrl });
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

api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== "object") return undefined;

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
