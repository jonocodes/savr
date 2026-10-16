// User-facing strings produced inside lib (read-time formatting and the
// progress messages surfaced while ingesting an article).
//
// lib stays framework-agnostic: it owns the English source of truth and a
// tiny default translator, while the app injects an i18next-backed
// translator at startup (src/i18n.ts) so the same strings can be shown in
// other languages. With no translator registered (unit tests, plain lib
// usage) the English defaults below are used.
export type MessageParams = Record<string, string | number>;

export type MessageTranslator = (key: LibMessageKey, params?: MessageParams) => string;

export const LIB_MESSAGES = {
  min: "min",
  hr: "hr",
  day: "day",
  days: "days",
  minuteRead: "{{count}} minute read",
  starting: "starting",
  fetchingArticle: "fetching article",
  scrapingContent: "scraping content",
  downloadingImages: "downloading images",
  creatingThumbnail: "creating thumbnail",
  generatingSummary: "generating summary",
  summaryGenerated: "summary generated",
  summaryGenerationSkipped: "summary generation skipped (API error)",
  processingPdf: "processing PDF",
  savingPdf: "saving PDF",
  savingMetadata: "saving metadata",
  processingImage: "processing image",
  savingImage: "saving image",
  done: "done",
  collectingImages: "collecting images",
  downloadingImage: "downloading image {{current}} of {{total}}",
  imageDownloadedVia: "image downloaded via {{downloader}}: {{url}}",
  resizingImage: "resizing image {{current}} of {{total}}",
  imageFailedVia: "image failed via {{attempts}}: {{url}}",
  imageFailedAfterDownload: "image failed after download ({{error}}): {{url}}",
  imagesDownloadedForOfflineUse:
    "{{downloaded}} of {{total}} images downloaded for offline use",
  imageFallback: "image {{timestamp}}",
} as const satisfies Record<string, string>;

export type LibMessageKey = keyof typeof LIB_MESSAGES;

const interpolate = (template: string, params?: MessageParams): string => {
  if (!params) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
  );
};

let translator: MessageTranslator | null = null;

// Register the app's translator. Keys are plain (e.g. "downloadingImages");
// the app namespaces them under "lib." itself.
export const setLibMessageTranslator = (fn: MessageTranslator | null): void => {
  translator = fn;
};

// BCP-47 tag lib should format dates/numbers with ("en" unless the app is
// running in another language). Set by the app alongside the translator.
let locale = "en";

export const setLibLocale = (nextLocale: string): void => {
  locale = nextLocale || "en";
};

export const getLocale = (): string => locale;

// Translate a lib message, falling back to the built-in English text.
export const t = (key: LibMessageKey, params?: MessageParams): string => {
  if (translator) return translator(key, params);
  return interpolate(LIB_MESSAGES[key], params);
};
