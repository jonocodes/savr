const api = globalThis.browser ?? globalThis.chrome;

const saveButton = document.getElementById("save");
const visitButton = document.getElementById("visit");
const settingsButton = document.getElementById("settings");
const statusEl = document.getElementById("status");

function setStatus(text) {
  statusEl.textContent = text ?? "";
}

function setBusy(busy) {
  saveButton.disabled = busy;
  visitButton.disabled = busy;
}

saveButton.addEventListener("click", async () => {
  setBusy(true);
  setStatus("Saving…");
  try {
    const response = await api.runtime.sendMessage({ type: "SAVE_ACTIVE_PAGE" });
    if (response?.ok) {
      setStatus("Opening the Savr save dialog…");
      window.setTimeout(() => window.close(), 800);
    } else {
      setStatus(response?.error || "Could not save this page.");
      setBusy(false);
    }
  } catch {
    setStatus("Could not reach the extension background.");
    setBusy(false);
  }
});

visitButton.addEventListener("click", async () => {
  setBusy(true);
  try {
    const response = await api.runtime.sendMessage({ type: "VISIT_SAVR" });
    if (response?.ok === false) {
      setStatus(response.error || "Could not open Savr.");
      setBusy(false);
      return;
    }
    window.close();
  } catch {
    setStatus("Could not open Savr.");
    setBusy(false);
  }
});

settingsButton.addEventListener("click", () => {
  // Firefox opens the options page in a tab, Chrome in its extensions UI.
  (api.runtime.openOptionsPage?.() ?? Promise.resolve()).catch(() => {});
  window.close();
});
