(async () => {
  // Savr — YouTube transcript bookmarklet.
  //
  // Runs on a YouTube watch page: opens the transcript panel, scrapes it, and
  // sends it to Savr as raw content (action "savr-raw"). Savr stores it verbatim
  // — Readability is never run — because the transcript is injected by YouTube's
  // JS and isn't present in the statically-fetched page.
  //
  // To turn this into a bookmarklet, minify it (e.g. https://js.do/blog/bookmarklets/)
  // and prefix with "javascript:".

  // --- Config -------------------------------------------------------------
  // "__SAVR_ORIGIN__" is a placeholder: the app's Vite build minifies this file
  // and PreferenceScreen.tsx substitutes the real Savr origin at runtime, so
  // there is a single source of truth for this script. To use it standalone,
  // replace the placeholder with your Savr origin (e.g. "http://localhost:3000").
  const SAVR_ORIGIN = "__SAVR_ORIGIN__";
  const STRIP_TIMESTAMPS = true; // false → keep leading "[00:34] " markers

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // YouTube's transcript DOM changed: modern pages use
  // <transcript-segment-view-model> with ytw* class names; older pages used
  // <ytd-transcript-segment-renderer> with .segment-* class names. Match both.
  const SEGMENT_SEL =
    "transcript-segment-view-model, ytd-transcript-segment-renderer";
  const TIMESTAMP_SEL =
    ".ytwTranscriptSegmentViewModelTimestamp, .segment-timestamp";
  const TEXT_SEL = ".ytAttributedStringHost, .segment-text";

  async function waitForSegments(maxTries, interval) {
    for (let i = 0; i < maxTries; i++) {
      const segs = document.querySelectorAll(SEGMENT_SEL);
      if (segs.length) return segs;
      await sleep(interval);
    }
    return document.querySelectorAll(SEGMENT_SEL);
  }

  // --- Open the transcript panel (if not already open) --------------------
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
    }

    segments = await waitForSegments(10, 400);
  }

  if (!segments.length) {
    alert(
      "Could not open the transcript panel automatically. Try opening it manually once, then run this again."
    );
    return;
  }

  // --- Scrape transcript + metadata --------------------------------------
  const lines = [...segments].map((seg) => {
    const time = seg.querySelector(TIMESTAMP_SEL)?.textContent.trim() || "";
    // Don't fall back to seg.textContent — the new DOM nests the timestamp and a
    // hidden a11y label ("1 second") inside the segment, which would pollute the line.
    const text = seg.querySelector(TEXT_SEL)?.textContent.trim() || "";
    if (STRIP_TIMESTAMPS) return text;
    return time ? `[${time}] ${text}` : text;
  });
  const content = lines.join("\n");

  const title =
    document
      .querySelector("h1.ytd-watch-metadata, #title h1, h1.title yt-formatted-string")
      ?.textContent?.trim() ||
    (document.title || "YouTube transcript").replace(/\s*-\s*YouTube\s*$/, "").trim();

  const author =
    document
      .querySelector("ytd-channel-name #text a, #owner #channel-name a, ytd-channel-name a")
      ?.textContent?.trim() || null;

  const pageUrl = window.location.href;

  // --- Send to Savr -------------------------------------------------------
  const savrWindow = window.open(`${SAVR_ORIGIN}/?rawIngest=1`, "_blank");
  if (!savrWindow) {
    alert("Could not open the Savr window. Please allow pop-ups for this site.");
    return;
  }

  let sent = false;
  const onMessage = (event) => {
    if (event.source !== savrWindow) return;
    if (event.data?.action !== "savr-ready" || sent) return;
    sent = true;
    window.removeEventListener("message", onMessage);
    savrWindow.postMessage(
      {
        action: "savr-raw",
        content,
        contentType: "text/plain",
        title,
        author,
        url: pageUrl,
      },
      SAVR_ORIGIN
    );
  };
  window.addEventListener("message", onMessage);
})();
