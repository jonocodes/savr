import DOMPurify, { type Config, type DOMPurify as Purifier } from "dompurify";

/**
 * The embed hosts Readability deliberately keeps when it cleans an article body
 * (its internal `REGEXPS.videos`). DOMPurify's default allow-list drops every
 * `<iframe>`, so a video embedded by the original page survived scraping but
 * vanished at render time. We re-allow exactly this set, so an iframe only
 * appears when both stages agree it is a genuine video embed — arbitrary
 * iframes stay blocked.
 */
export const ALLOWED_VIDEO_EMBED_REGEX =
  /\/\/(www\.)?((dailymotion|youtube|youtube-nocookie|player\.vimeo|v\.qq)\.com|(archive|upload\.wikimedia)\.org|player\.twitch\.tv)/i;

export function isAllowedVideoEmbed(src: string | null | undefined): boolean {
  return !!src && ALLOWED_VIDEO_EMBED_REGEX.test(src);
}

// `link` must stay allowed because stored article content is an ArticleTemplate
// fragment that references the reader stylesheet. The extra iframe attributes
// preserve the player chrome (fullscreen, autoplay policy) the original page set.
const SANITIZE_CONFIG: Config = {
  ADD_TAGS: ["link", "iframe"],
  ADD_ATTR: [
    "rel",
    "href",
    "allow",
    "allowfullscreen",
    "frameborder",
    "scrolling",
    "referrerpolicy",
  ],
};

/**
 * Build a sanitiser around a DOMPurify instance. The purifier is injected so
 * the policy can be unit-tested against a jsdom window (the app itself uses the
 * browser-bound default below).
 */
export function createArticleSanitizer(purify: Purifier): (html: string) => string {
  let hookRegistered = false;

  return (html: string): string => {
    if (!hookRegistered) {
      hookRegistered = true;
      purify.addHook("uponSanitizeElement", (node, data) => {
        if (data.tagName !== "iframe") return;
        const src = (node as Element).getAttribute?.("src") ?? null;
        if (isAllowedVideoEmbed(src)) return;
        node.parentNode?.removeChild(node);
      });
    }

    return purify.sanitize(html, SANITIZE_CONFIG);
  };
}

export const sanitizeArticleHtml = createArticleSanitizer(DOMPurify);
