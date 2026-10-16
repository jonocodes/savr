import {
  APP_URL_KEY,
  DEFAULT_APP_URL,
  YOUTUBE_TRANSCRIPTS_KEY,
  hostPatternFor,
  parseAppUrl,
  resolveYoutubeTranscripts,
} from "./settings.js";

const api = globalThis.browser ?? globalThis.chrome;

const form = document.getElementById("options-form");
const input = document.getElementById("app-url");
const youtubeToggle = document.getElementById("youtube-transcripts");
const statusEl = document.getElementById("status");

const msg = (key, substitutions) => api.i18n.getMessage(key, substitutions);

// Localised copy that embeds a <code>…</code> fragment. Built from text nodes
// rather than innerHTML: the message comes from our own _locales files, but
// this way no markup ever reaches the HTML parser.
function setRichText(el, text) {
  const nodes = text
    .split(/(<code>[\s\S]*?<\/code>)/g)
    .filter(Boolean)
    .map((part) => {
      const code = part.match(/^<code>([\s\S]*)<\/code>$/);
      if (!code) return document.createTextNode(part);
      const element = document.createElement("code");
      element.textContent = code[1];
      return element;
    });
  el.replaceChildren(...nodes);
}

function applyTranslations() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const text = msg(el.getAttribute("data-i18n"));
    if (text) el.textContent = text;
  });
  document.querySelectorAll("[data-i18n-html]").forEach((el) => {
    const text = msg(el.getAttribute("data-i18n-html"));
    if (text) setRichText(el, text);
  });
}

applyTranslations();

async function load() {
  const stored = await api.storage.local.get([APP_URL_KEY, YOUTUBE_TRANSCRIPTS_KEY]);
  input.value = stored[APP_URL_KEY] || DEFAULT_APP_URL;
  youtubeToggle.checked = resolveYoutubeTranscripts(stored[YOUTUBE_TRANSCRIPTS_KEY]);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  statusEl.textContent = "";

  const appUrl = parseAppUrl(input.value);
  if (!appUrl) {
    statusEl.textContent = msg("optionsInvalidUrl");
    return;
  }

  // Firefox only honours permissions.request() synchronously inside the user
  // gesture — any await before it (even permissions.contains) makes it throw.
  // It resolves true without prompting when access is already granted.
  let allowed = false;
  try {
    allowed = await api.permissions.request({ origins: [hostPatternFor(appUrl)] });
  } catch (error) {
    statusEl.textContent = msg("optionsAccessError", { message: String(error?.message ?? error) });
    return;
  }
  if (!allowed) {
    statusEl.textContent = msg("optionsAccessNeeded");
    return;
  }

  await api.storage.local.set({
    [APP_URL_KEY]: appUrl,
    [YOUTUBE_TRANSCRIPTS_KEY]: youtubeToggle.checked,
  });
  input.value = appUrl;
  statusEl.textContent = msg("optionsSaved");
});

void load();
