// ExtensionConnector.ts
// Communication bridge between SAVR PWA and bookmarklet/opener window

import { init } from "./storage";
import { ingestCurrentPage } from "../../../lib/src/ingestion";
import { mimeToExt } from "../../../lib/src/lib";
import RemoteStorage from "remotestoragejs";
import BaseClient from "remotestoragejs/release/types/baseclient";

import filenamifyUrl from "filenamify-url";

import md5 from "js-md5";

export interface ResourceResponse {
  url: string;
  data?: string;
  type?: string;
  success: boolean;
  error?: string;
}

interface Storage {
  remoteStorage: RemoteStorage;
  client: BaseClient;
}

// interface Storage {
//   pages: {
//     save: (data: { url: string; title?: string; html: string; savedAt: string }) => Promise<void>;
//   };
//   resources: {
//     save: (data: { url: string; data: string; type: string; savedAt: string }) => Promise<void>;
//   };
// }

class ExtensionConnector {
  private openerWindow: Window | null = null;
  private storageClient: any = null;
  private pendingMessage: { url: string; html: string } | null = null;
  private progressCallback: ((percent: number | null, message: string | null) => void) | null =
    null;
  private pendingResourceCallbacks = new Map<string, (resources: ResourceResponse[]) => void>();

  private store: { remoteStorage: RemoteStorage; client: BaseClient } | null = null;

  constructor() {
    // Only initialize if we're in a browser environment
    if (typeof window !== "undefined") {
      this.initializeListener();

      // const setup = async () => {
      //   this.store = await init();
      // };
      // setup();

      // const { remoteStorage: store, client } = await init();

      if (window.opener) {
        this.openerWindow = window.opener;
        window.opener.postMessage({ action: "savr-ready", source: "SAVR_PWA" }, "*");
      }
    }
  }

  private initializeListener(): void {
    if (typeof window !== "undefined") {
      window.addEventListener("message", this.handleBookmarkletMessage.bind(this));
      window.addEventListener("message", this.handleOpenerMessage.bind(this));
    }
  }

  private handleBookmarkletMessage(event: MessageEvent): void {
    const msg = event.data as any;
    if (msg.url && msg.html) {
      console.log("PWA: Received bookmarklet page", msg.url);
      if (!this.storageClient) {
        this.pendingMessage = { url: msg.url, html: msg.html };
      } else {
        this.processBookmarkletMessage(msg.url, msg.html);
      }
    }
  }

  private handleOpenerMessage(event: MessageEvent): void {
    const msg = event.data as any;
    if (
      event.source === this.openerWindow &&
      msg.source === "SAVR_BOOKMARKLET" &&
      msg.action === "resource-response"
    ) {
      console.log("PWA: Received resource-response", msg.messageId);
      const cb = this.pendingResourceCallbacks.get(msg.messageId);
      if (cb) {
        cb(msg.resources as ResourceResponse[]);
        this.pendingResourceCallbacks.delete(msg.messageId);
      }
    }
  }

  public setStorageClient(client: any): void {
    this.storageClient = client;
    console.log("PWA: Storage client set");
    if (this.pendingMessage) {
      const { url, html } = this.pendingMessage;
      this.pendingMessage = null;
      this.processBookmarkletMessage(url, html);
    }
  }

  public setProgressCallback(
    callback: (percent: number | null, message: string | null) => void
  ): void {
    this.progressCallback = callback;
    console.log("PWA: Progress callback set");
  }

  public requestResourcesFromOpener(slug: string, urls: string[]): Promise<ResourceResponse[]> {
    console.log("PWA: requestResourcesFromOpener", urls);
    if (typeof window === "undefined" || !this.openerWindow) {
      console.warn("PWA: No opener window for resource requests");
      return Promise.resolve([]);
    }
    const messageId = "resource-request-" + Date.now();
    return new Promise((resolve) => {
      this.pendingResourceCallbacks.set(messageId, resolve);
      this.openerWindow!.postMessage(
        { action: "request-resources", source: "SAVR_PWA", messageId, slug, urls },
        "*"
      );
    });
  }

  private async processBookmarkletMessage(url: string, html: string): Promise<void> {
    try {
      const article = await ingestCurrentPage(
        this.storageClient,
        html,
        "text/html",
        url,
        (percent, message) => {
          console.log(`PWA: ingest progress ${percent}% - ${message}`);
          this.progressCallback?.(percent, message);
        }
      );
      console.log("PWA: ingest complete, extracting images");
      const imageUrls = this.extractImageUrls(html, url);
      if (imageUrls.length) {
        this.progressCallback?.(0, `Downloading images: 0/${imageUrls.length}`);
        const resources = await this.requestResourcesFromOpener(article.slug, imageUrls);
        for (let idx = 0; idx < resources.length; idx++) {
          const r = resources[idx];
          const pct = Math.floor(((idx + 1) / resources.length) * 100);
          this.progressCallback?.(pct, `Downloading images: ${idx + 1}/${resources.length}`);
          if (r.success && r.data) {
            await this.saveResource(r.url, article.slug, r.data, r.type || "image/jpeg");
          }
        }
      }
      console.log("PWA: Page and resources ingested successfully");
    } catch (err) {
      console.error("PWA: Error in processBookmarkletMessage:", err);
    }
  }

  private extractImageUrls(html: string, baseUrl: string): string[] {
    if (typeof window === "undefined") {
      return [];
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    return (
      Array.from(doc.querySelectorAll("img"))
        .map((img) => img.getAttribute("src") || "")
        // Skip empty and data URLs
        .filter((src) => src && !src.startsWith("data:"))
        .map((src) => {
          try {
            return new URL(src, baseUrl).href;
          } catch {
            return "";
          }
        })
        .filter((u) => u)
    );
  }

  private async saveResource(
    url: string,
    slug: string,
    dataUrl: string,
    mimeType: string
  ): Promise<void> {
    // TODO: change to checksum
    // const name = self.crypto.randomUUID();

    const name = filenamifyUrl(url, { replacement: "__" });

    // calcualte the checksum of the url

    // const checksum = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(url));
    // const checksumHex = Array.from(new Uint8Array(checksum))
    //   .map((byte) => byte.toString(16).padStart(2, "0"))
    //   .join("");

    const hash = md5.md5(url);

    const ext = mimeToExt[mimeType] || "unknown";

    // const path = `saves/${slug}/resources/${hash}.${ext}`;

    const path = `saves/${slug}/resources/${name}`;

    console.log("PWA: saving resource", url, path);

    const storage = await this.getStorage();

    await storage.client.storeFile(mimeType, path, dataUrl);

    // await storage.resources.save({ url, data: dataUrl, type: mimeType, savedAt: now });

    console.log(`PWA: Saved resource: ${url}`);
  }

  // private async getStorage(): Promise<Storage> {
  private async getStorage(): Promise<Storage> {
    if (!this.store) {
      this.store = await init();
    }

    return this.store;
  }
}

export default new ExtensionConnector();
