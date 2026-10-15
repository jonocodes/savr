import type { ImageSource } from "~/utils/net/imageSources";

/**
 * App side of the browser-extension image bridge.
 *
 * Handshake: the app announces `savr-ready`; the extension's injected bridge
 * replies with the saved page (`savr-html` / `savr-raw`) carrying
 * `source: "extension"` and its `extensionVersion`. A reply without a valid
 * version is treated as "no image bridge" (a bookmarklet, or an older
 * extension), so behaviour stays exactly as before.
 *
 * Image requests: the app posts `{action: "savr-image-request", id, url}` on
 * its own window; the extension's relay content script forwards it to the
 * background (which fetches with its host permissions, CORS-exempt) and posts
 * back `{action: "savr-image-response", id, ok, dataUrl | error}`. Replies are
 * matched by id and time out, so a broken or slow extension only costs a
 * fallback to the proxy.
 */

export const IMAGE_REQUEST_ACTION = "savr-image-request";
export const IMAGE_RESPONSE_ACTION = "savr-image-response";

// Longer than the background's own fetch timeout (10 s), so the extension always
// answers first while it is alive — a timeout here really means "relay gone".
const DEFAULT_TIMEOUT_MS = 15000;
const VERSION_RE = /^\d+(\.\d+){0,3}$/;

export interface ExtensionInfo {
  version: string;
}

/** Message transport; the default is the page's own window. */
export interface BridgeChannel {
  post(message: unknown): void;
  subscribe(listener: (data: unknown) => void): () => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** The extension's handshake reply, or null when it is not one. */
export function parseExtensionHandshake(data: unknown): ExtensionInfo | null {
  if (!isRecord(data) || data.source !== "extension") return null;
  const version = data.extensionVersion;
  if (typeof version !== "string" || !VERSION_RE.test(version)) return null;
  return { version };
}

/**
 * The handshake from a delivery event. Only messages posted on the app's own
 * window count — the extension's bridge runs there — so a page delivering a
 * bookmarklet payload from another origin cannot claim to be the extension.
 */
export function extensionFromMessageEvent(
  event: Pick<MessageEvent, "origin" | "source" | "data">,
  win: Window = window
): ExtensionInfo | null {
  if (event.origin !== win.location.origin || event.source !== win) return null;
  return parseExtensionHandshake(event.data);
}

export function extensionDownloaderLabel(info: ExtensionInfo): string {
  return `extension ${info.version}`;
}

/** Decode a base64 `data:image/...` URL; anything else is rejected. */
export function dataUrlToBlob(dataUrl: string): Blob {
  const match = /^data:(image\/[\w.+-]+);base64,([A-Za-z0-9+/=]*)$/.exec(dataUrl);
  if (!match) throw new Error("Not a base64 image data URL");
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: match[1] });
}

/** Messages on this window from this origin — where the relay posts. */
export function windowChannel(win: Window = window): BridgeChannel {
  const origin = win.location.origin;
  return {
    post(message) {
      win.postMessage(message, origin);
    },
    subscribe(listener) {
      const onMessage = (event: MessageEvent) => {
        if (event.origin !== origin) return;
        listener(event.data);
      };
      win.addEventListener("message", onMessage);
      return () => win.removeEventListener("message", onMessage);
    },
  };
}

function replyToBlob(reply: Record<string, unknown>): Blob {
  if (reply.ok === true) {
    if (typeof reply.dataUrl !== "string") throw new Error("Extension sent a malformed reply");
    try {
      return dataUrlToBlob(reply.dataUrl);
    } catch {
      throw new Error("Extension sent a malformed reply (not an image)");
    }
  }
  if (reply.ok === false) {
    throw new Error(
      typeof reply.error === "string" && reply.error
        ? reply.error
        : "Extension could not fetch the image"
    );
  }
  throw new Error("Extension sent a malformed reply");
}

/** An image source that asks the extension for the bytes. */
export function createExtensionImageSource(
  info: ExtensionInfo,
  options: {
    channel?: BridgeChannel;
    timeoutMs?: number;
    newId?: () => string;
  } = {}
): ImageSource {
  const channel = options.channel ?? windowChannel();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const newId = options.newId ?? (() => crypto.randomUUID());
  // After one unanswered request, assume the relay is gone and fail the rest
  // of this save fast rather than waiting out a timeout per image.
  let unresponsive = false;

  return {
    label: extensionDownloaderLabel(info),
    fetchImage(url: string): Promise<Blob> {
      if (unresponsive) return Promise.reject(new Error("Extension stopped answering"));
      const id = newId();
      return new Promise<Blob>((resolve, reject) => {
        const settle = (outcome: () => Blob) => {
          clearTimeout(timer);
          unsubscribe();
          try {
            resolve(outcome());
          } catch (error) {
            reject(error);
          }
        };
        const unsubscribe = channel.subscribe((data) => {
          if (!isRecord(data) || data.action !== IMAGE_RESPONSE_ACTION || data.id !== id) return;
          settle(() => replyToBlob(data));
        });
        const timer = setTimeout(
          () =>
            settle(() => {
              unresponsive = true;
              throw new Error(`Extension did not answer within ${timeoutMs} ms`);
            }),
          timeoutMs
        );
        channel.post({ action: IMAGE_REQUEST_ACTION, id, url });
      });
    },
  };
}

/**
 * The telemetry capture source for an externally delivered save: the
 * extension reuses the bookmarklet ingest paths, so without this its saves
 * would be counted as bookmarklet ones.
 */
export function externalCaptureSource(
  payload: "html" | "raw",
  extension: ExtensionInfo | null
): string {
  if (payload === "raw") return extension ? "extension-raw" : "raw";
  return extension ? "extension" : "bookmarklet";
}
