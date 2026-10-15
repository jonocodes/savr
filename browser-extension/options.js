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
    statusEl.textContent = "Enter a valid http(s) address.";
    return;
  }

  const pattern = hostPatternFor(appUrl);
  const granted = await api.permissions.contains({ origins: [pattern] });
  if (!granted) {
    const allowed = await api.permissions.request({ origins: [pattern] });
    if (!allowed) {
      statusEl.textContent = "Access to that address is needed to save pages to it.";
      return;
    }
  }

  await api.storage.local.set({
    [APP_URL_KEY]: appUrl,
    [YOUTUBE_TRANSCRIPTS_KEY]: youtubeToggle.checked,
  });
  input.value = appUrl;
  statusEl.textContent = "Saved.";
});

void load();
