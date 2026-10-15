/**
 * Savr — YouTube transcript extraction.
 *
 * This file is the single source of truth for the extraction. The extension's
 * background serializes `scrapeYouTubeTranscript` into the watch tab with
 * `scripting.executeScript`, and the app's build (the `minify-bookmarklet` Vite
 * plugin) inlines the same function into the Preferences bookmarklet.
 *
 * Keep it self-contained — no imports, no closure over module state — or both
 * consumers break.
 *
 * The returned content is HTML rather than plain text so the video thumbnail
 * can travel with it: the app's image pipeline downloads that image like any
 * article image, which also gives the saved article its list thumbnail. The
 * transcript itself stays in a <pre>, matching how the raw text ingest renders
 * plain text.
 */
export async function scrapeYouTubeTranscript() {
  const STRIP_TIMESTAMPS = true; // false → keep leading "[00:34] " markers

  // YouTube's transcript DOM changed: modern pages use
  // <transcript-segment-view-model> with ytw* class names; older pages used
  // <ytd-transcript-segment-renderer> with .segment-* class names. Match both.
  const SEGMENT_SEL = "transcript-segment-view-model, ytd-transcript-segment-renderer";
  const TIMESTAMP_SEL = ".ytwTranscriptSegmentViewModelTimestamp, .segment-timestamp";
  const TEXT_SEL = ".ytAttributedStringHost, .segment-text";

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function waitForSegments(maxTries, interval) {
    for (let i = 0; i < maxTries; i++) {
      const found = document.querySelectorAll(SEGMENT_SEL);
      if (found.length) return found;
      await sleep(interval);
    }
    return document.querySelectorAll(SEGMENT_SEL);
  }

  const escapeHtml = (value) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

  // --- Open the transcript panel (if not already open) ---------------------
  let segments = await waitForSegments(2, 300);

  if (!segments.length) {
    const candidate =
      [...document.querySelectorAll("[aria-label]")].find((el) =>
        /^show transcript$/i.test((el.getAttribute("aria-label") || "").trim())
      ) ||
      [...document.querySelectorAll("[aria-label]")].find((el) =>
        /transcript/i.test(el.getAttribute("aria-label") || "")
      );

    if (candidate) {
      candidate.scrollIntoView({ block: "center" });
      await sleep(200);
      candidate.click();
      candidate
        .closest("button, yt-button-shape, tp-yt-paper-button, ytd-menu-service-item-renderer")
        ?.click();
      segments = await waitForSegments(10, 400);
    } else {
      // No transcript button on this page — give a slow render one last chance.
      segments = await waitForSegments(2, 300);
    }
  }

  if (!segments.length) {
    return {
      ok: false,
      reason:
        "Could not open the transcript panel automatically. Try opening it manually once, then run this again.",
    };
  }

  // --- Scrape transcript + metadata ----------------------------------------
  const lines = [...segments].map((segment) => {
    const time = segment.querySelector(TIMESTAMP_SEL)?.textContent.trim() || "";
    // Don't fall back to segment.textContent — the new DOM nests the timestamp
    // and a hidden a11y label ("1 second") inside the segment, which would
    // pollute the line.
    const text = segment.querySelector(TEXT_SEL)?.textContent.trim() || "";
    if (STRIP_TIMESTAMPS) return text;
    return time ? `[${time}] ${text}` : text;
  });

  const title =
    document
      .querySelector("h1.ytd-watch-metadata, #title h1, h1.title yt-formatted-string")
      ?.textContent?.trim() ||
    (document.title || "YouTube transcript").replace(/\s*-\s*YouTube\s*$/, "").trim();

  const author =
    document
      .querySelector("ytd-channel-name #text a, #owner #channel-name a, ytd-channel-name a")
      ?.textContent?.trim() || null;

  // og:image is the video's large thumbnail; some pages lack it, so fall back
  // to the well-known i.ytimg.com pattern for the video id.
  const videoId = new URLSearchParams(window.location.search).get("v");
  const thumbnail =
    document.querySelector('meta[property="og:image"]')?.getAttribute("content") ||
    (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null);

  const parts = [];
  if (thumbnail) {
    parts.push(`<p><img src="${escapeHtml(thumbnail)}" alt=""></p>`);
  }
  parts.push(
    `<pre style="white-space: pre-wrap; word-wrap: break-word; font-family: inherit;">${escapeHtml(
      lines.join("\n")
    )}</pre>`
  );

  return {
    ok: true,
    contentType: "text/html",
    content: parts.join(""),
    title,
    author,
    url: window.location.href,
  };
}
