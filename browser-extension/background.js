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
 * Delivery is queued in `storage.session` and retried when the app tab reports
 * `complete`, so a background context that is unloaded mid-save (Chrome
 * service workers are recycled aggressively) resumes instead of dropping the
 * payload.
 */

import { APP_URL_KEY, hostPatternFor, normalizeAppUrl } from "./settings.js";

const api = globalThis.browser ?? globalThis.chrome;

const PENDING_DELIVERY_KEY = "pendingDelivery";

/* ------------------------------------------------------------------------ */
/* Settings                                                                  */
/* ------------------------------------------------------------------------ */

async function getAppUrl() {
  const stored = await api.storage.local.get(APP_URL_KEY);
  return normalizeAppUrl(stored[APP_URL_KEY]);
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
 * once with the payload, and stops listening.
 */
function deliverWhenReady(payload) {
  let delivered = false;
  const onMessage = (event) => {
    if (event.source !== window) return;
    if (!event.data || event.data.action !== "savr-ready") return;
    if (delivered) return;
    delivered = true;
    window.removeEventListener("message", onMessage);
    window.postMessage(
      {
        action: "savr-html",
        url: payload.url,
        html: payload.html,
        source: "extension",
      },
      window.location.origin
    );
  };
  window.addEventListener("message", onMessage);
  // Do not keep a listener alive forever if the app never announces itself.
  setTimeout(() => window.removeEventListener("message", onMessage), 5 * 60 * 1000);
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
    await api.scripting.executeScript({
      target: { tabId },
      func: deliverWhenReady,
      args: [payload],
    });
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

async function saveActivePage() {
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  if (!tab || tab.id === undefined) {
    return { ok: false, error: "No active tab to save." };
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

  const appUrl = await getAppUrl();
  const appTab = await api.tabs.create({
    url: `${appUrl}/?bookmarklet=${encodeURIComponent(page.url)}`,
  });
  if (appTab.id !== undefined) {
    await queueDelivery(appTab.id, page);
  }
  return { ok: true };
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
