import type { ImageSource } from "~/utils/net/imageSources";
import type { PageSource } from "~/utils/net/pageSources";

/**
 * App side of the browser-extension bridge.
 *
 * Handshake: the app announces `savr-ready`; the extension's injected bridge
 * replies with the saved page (`savr-html` / `savr-raw`) carrying
 * `source: "extension"` and its `extensionVersion`. A reply without a valid
 * version is treated as "no image bridge" (a bookmarklet, or an older
 * extension), so behaviour stays exactly as before.
 *
 * Probe: for saves started in the app itself (Add Article, Refetch) there is
 * no delivery to carry the handshake, so the app posts
 * `{action: "savr-extension-ping", id}` and the extension's app-bridge content
 * script answers `{action: "savr-extension-pong", id, source, extensionVersion}`.
 *
 * Requests: the app posts `{action: "savr-image-request" | "savr-page-request",
 * id, url}` on its own window; the extension's content script forwards it to
 * the background (which fetches with its host permissions, CORS-exempt, no
 * cookies) and posts back the matching `-response` with `{id, ok, ...}`.
 * Replies are matched by id and time out, so a broken or slow extension only
 * costs a fallback to the proxy.
 */

export const IMAGE_REQUEST_ACTION = "savr-image-request";
export const IMAGE_RESPONSE_ACTION = "savr-image-response";
export const PAGE_REQUEST_ACTION = "savr-page-request";
export const PAGE_RESPONSE_ACTION = "savr-page-response";
export const PING_ACTION = "savr-extension-ping";
export const PONG_ACTION = "savr-extension-pong";

// Longer than the background's own fetch timeouts (10 s images, 15 s pages), so
// the extension always answers first while it is alive — a timeout here really
// means "relay gone".
const DEFAULT_TIMEOUT_MS = 15000;
const PAGE_TIMEOUT_MS = 20000;
// The bridge answers from the content script without waking the background,
// so a present extension replies in milliseconds; this only bounds the wait
// when there is none.
const PROBE_TIMEOUT_MS = 750;
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
  throw replyError(reply, "Extension could not fetch the image");
}

/** The error for a reply that is not `ok: true`. */
function replyError(reply: Record<string, unknown>, fallback: string): Error {
  if (reply.ok === false) {
    return new Error(typeof reply.error === "string" && reply.error ? reply.error : fallback);
  }
  return new Error("Extension sent a malformed reply");
}

interface RequestOptions {
  channel: BridgeChannel;
  timeoutMs: number;
  newId: () => string;
}

/**
 * Post `{action, id, ...body}` and resolve with the first `responseAction`
 * message carrying the same id; reject after `timeoutMs`. The listener is
 * always removed, whichever way it settles.
 */
function requestReply(
  action: string,
  responseAction: string,
  body: Record<string, unknown>,
  { channel, timeoutMs, newId }: RequestOptions
): Promise<Record<string, unknown>> {
  const id = newId();
  return new Promise((resolve, reject) => {
    const unsubscribe = channel.subscribe((data) => {
      if (!isRecord(data) || data.action !== responseAction || data.id !== id) return;
      clearTimeout(timer);
      unsubscribe();
      resolve(data);
    });
    const timer = setTimeout(() => {
      unsubscribe();
      reject(new ExtensionTimeoutError(timeoutMs));
    }, timeoutMs);
    channel.post({ action, id, ...body });
  });
}

class ExtensionTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Extension did not answer within ${timeoutMs} ms`);
    this.name = "ExtensionTimeoutError";
  }
}

function requestOptions(options: {
  channel?: BridgeChannel;
  timeoutMs?: number;
  newId?: () => string;
}, defaultTimeoutMs: number): RequestOptions {
  return {
    channel: options.channel ?? windowChannel(),
    timeoutMs: options.timeoutMs ?? defaultTimeoutMs,
    newId: options.newId ?? (() => crypto.randomUUID()),
  };
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
  const request = requestOptions(options, DEFAULT_TIMEOUT_MS);
  // After one unanswered request, assume the relay is gone and fail the rest
  // of this save fast rather than waiting out a timeout per image.
  let unresponsive = false;

  return {
    label: extensionDownloaderLabel(info),
    async fetchImage(url: string): Promise<Blob> {
      if (unresponsive) throw new Error("Extension stopped answering");
      try {
        return replyToBlob(await requestReply(IMAGE_REQUEST_ACTION, IMAGE_RESPONSE_ACTION, { url }, request));
      } catch (error) {
        if (error instanceof ExtensionTimeoutError) unresponsive = true;
        throw error;
      }
    },
  };
}

/** Base64 → bytes, rejecting anything that is not strict base64. */
function base64ToBytes(base64: string): Uint8Array {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) throw new Error("not base64");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function replyToResponse(reply: Record<string, unknown>): Response {
  if (reply.ok !== true) throw replyError(reply, "Extension could not fetch the page");
  if (typeof reply.contentType !== "string" || !reply.contentType || typeof reply.base64 !== "string") {
    throw new Error("Extension sent a malformed reply");
  }
  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(reply.base64);
  } catch {
    throw new Error("Extension sent a malformed reply (body is not base64)");
  }
  return new Response(bytes as BodyInit, { headers: { "content-type": reply.contentType } });
}

/**
 * A page source that asks the extension to download the article itself, for
 * a save typed into the app (Add Article, Refetch). The extension fetches
 * with its host permissions — CORS-exempt, no cookies — so a URL save works
 * with no proxy configured. The bytes travel back as base64 (runtime messages
 * are JSON) and are rebuilt into a `Response`, so ingest handles HTML, text,
 * PDFs and images exactly as it does for a proxy response.
 */
export function createExtensionPageSource(
  info: ExtensionInfo,
  options: {
    channel?: BridgeChannel;
    timeoutMs?: number;
    newId?: () => string;
  } = {}
): PageSource {
  const request = requestOptions(options, PAGE_TIMEOUT_MS);
  return {
    label: extensionDownloaderLabel(info),
    async fetchPage(url: string): Promise<Response> {
      return replyToResponse(
        await requestReply(PAGE_REQUEST_ACTION, PAGE_RESPONSE_ACTION, { url }, request)
      );
    },
  };
}

/**
 * Ask whether the extension's app bridge is in this tab. The bridge is a
 * content script the extension (0.1.5+) registers on the configured Savr
 * address, so it is there on every app page — not only in tabs an extension
 * save opened. Resolves null when nothing answers: no extension, an older
 * one, or one configured for a different Savr address.
 */
export function probeExtension(
  options: {
    channel?: BridgeChannel;
    timeoutMs?: number;
    newId?: () => string;
  } = {}
): Promise<ExtensionInfo | null> {
  const { channel, timeoutMs, newId } = requestOptions(options, PROBE_TIMEOUT_MS);
  const id = newId();
  return new Promise((resolve) => {
    const finish = (info: ExtensionInfo | null) => {
      clearTimeout(timer);
      unsubscribe();
      resolve(info);
    };
    const unsubscribe = channel.subscribe((data) => {
      if (!isRecord(data) || data.action !== PONG_ACTION || data.id !== id) return;
      const info = parseExtensionHandshake(data);
      if (info) finish(info);
    });
    const timer = setTimeout(() => finish(null), timeoutMs);
    channel.post({ action: PING_ACTION, id });
  });
}

let detected: Promise<ExtensionInfo | null> | null = null;

/**
 * `probeExtension` on this window, shared by callers: a found extension is
 * remembered for the page's lifetime; a miss is forgotten once settled, so
 * the next save asks again (the bridge may have arrived since — e.g. the
 * extension was installed with the app already open).
 */
export function detectExtension(): Promise<ExtensionInfo | null> {
  if (!detected) {
    const probe = probeExtension();
    detected = probe;
    void probe.then((info) => {
      if (!info && detected === probe) detected = null;
    });
  }
  return detected;
}

/**
 * Ingest options for a URL save: the extension downloads the page and its
 * images first; the proxy (or a direct fetch) stays as the fallback for each.
 */
export function extensionFetchSources(info: ExtensionInfo | null): {
  pageSources?: PageSource[];
  imageSources?: ImageSource[];
} {
  if (!info) return {};
  return {
    pageSources: [createExtensionPageSource(info)],
    imageSources: [createExtensionImageSource(info)],
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
  if (payload === "raw") return extension ? "extension-extracted" : "bookmarklet-extracted";
  return extension ? "extension" : "bookmarklet";
}
