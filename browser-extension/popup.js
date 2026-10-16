const api = globalThis.browser ?? globalThis.chrome;

const saveButton = document.getElementById("save");
const visitButton = document.getElementById("visit");
const settingsButton = document.getElementById("settings");
const statusEl = document.getElementById("status");

const msg = (key) => api.i18n.getMessage(key);

function applyTranslations() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const text = msg(el.getAttribute("data-i18n"));
    if (text) el.textContent = text;
  });
}

applyTranslations();

function setStatus(text) {
  statusEl.textContent = text ?? "";
}

function setBusy(busy) {
  saveButton.disabled = busy;
  visitButton.disabled = busy;
}

saveButton.addEventListener("click", async () => {
  setBusy(true);
  setStatus(msg("popupSaving"));
  try {
    const response = await api.runtime.sendMessage({ type: "SAVE_ACTIVE_PAGE" });
    if (response?.ok) {
      const status = response.fallback
        ? msg("popupNoTranscript")
        : response.mode === "raw"
          ? msg("popupSavingTranscript")
          : msg("popupOpeningDialog");
      setStatus(status);
      window.setTimeout(() => window.close(), 900);
    } else {
      setStatus(response?.error || msg("popupCouldNotSave"));
      setBusy(false);
    }
  } catch {
    setStatus(msg("popupNoBackground"));
    setBusy(false);
  }
});

visitButton.addEventListener("click", async () => {
  setBusy(true);
  try {
    const response = await api.runtime.sendMessage({ type: "VISIT_SAVR" });
    if (response?.ok === false) {
      setStatus(response.error || msg("popupCouldNotOpen"));
      setBusy(false);
      return;
    }
    window.close();
  } catch {
    setStatus(msg("popupCouldNotOpen"));
    setBusy(false);
  }
});

settingsButton.addEventListener("click", () => {
  // Firefox opens the options page in a tab, Chrome in its extensions UI.
  (api.runtime.openOptionsPage?.() ?? Promise.resolve()).catch(() => {});
  window.close();
});
