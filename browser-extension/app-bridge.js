/**
 * Savr — app bridge (content script, isolated world).
 *
 * The background registers this on the configured Savr address (see
 * `syncAppBridge` in background.js), so it runs in every app tab — not only in
 * tabs an extension save opened. It lets saves started inside the app (Add
 * Article, Refetch) use the extension instead of a CORS proxy:
 *
 *   savr-extension-ping  → savr-extension-pong  {extensionVersion}
 *   savr-page-request    → savr-page-response   {ok, contentType, base64 | error}
 *   savr-image-request   → savr-image-response  {ok, dataUrl | error}
 *
 * All messages travel on the app's own window and are matched by id. The
 * fetches happen in the background, which checks the sender's origin again.
 *
 * Not a module (registered content scripts cannot be), so the app address is
 * resolved here with a copy of settings.js's rule: a stored http(s) origin, or
 * https://savr.link. Match patterns cannot carry a port, so the registration
 * covers every port on the app's host; the origin check narrows it down.
 */
(() => {
  const api = globalThis.browser ?? globalThis.chrome;
  if (globalThis.__savrAppBridge) return;
  globalThis.__savrAppBridge = true;
  // An extension-save relay injected before this script loaded would answer
  // image requests twice; this bridge covers them now.
  globalThis.__savrImageRelay?.stop();

  const DEFAULT_APP_URL = "https://savr.link";
  const APP_URL_KEY = "savrAppUrl";
  const origin = window.location.origin;

  function appOrigin(value) {
    try {
      const url = new URL(String(value ?? "").trim());
      if (url.protocol === "http:" || url.protocol === "https:") return url.origin;
    } catch {
      // fall through to the default
    }
    return DEFAULT_APP_URL;
  }

  // Read once, at document_start, so the first ping does not wait on it.
  const isApp = api.storage.local
    .get(APP_URL_KEY)
    .then((stored) => appOrigin(stored[APP_URL_KEY]) === origin)
    .catch(() => false);

  /** After an extension update or removal this copy is orphaned: go quiet. */
  const alive = () => Boolean(api.runtime?.id);

  const REQUESTS = {
    "savr-page-request": { response: "savr-page-response", type: "FETCH_PAGE" },
    "savr-image-request": { response: "savr-image-response", type: "FETCH_IMAGE" },
  };

  async function onMessage(event) {
    const data = event.data;
    if (event.source !== window || event.origin !== origin) return;
    if (!data || typeof data.id !== "string") return;
    const isPing = data.action === "savr-extension-ping";
    const request = REQUESTS[data.action];
    if (!isPing && !request) return;
    if (!(await isApp)) return;
    if (!alive()) {
      window.removeEventListener("message", onMessage);
      return;
    }

    if (isPing) {
      window.postMessage(
        {
          action: "savr-extension-pong",
          id: data.id,
          source: "extension",
          extensionVersion: api.runtime.getManifest().version,
        },
        origin
      );
      return;
    }

    if (typeof data.url !== "string") return;
    const reply = (body) =>
      window.postMessage({ ...body, action: request.response, id: data.id }, origin);
    try {
      const result = await api.runtime.sendMessage({ type: request.type, url: data.url });
      if (result && typeof result === "object") {
        reply(result);
      } else {
        reply({ ok: false, error: api.i18n?.getMessage("errNoReply") || "No reply from the extension" });
      }
    } catch (error) {
      reply({ ok: false, error: String((error && error.message) || error) });
    }
  }

  window.addEventListener("message", onMessage);
})();
