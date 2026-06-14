import { db } from "../db";
import { init } from "../sync/storage";

// Files under /public/savr/ are accessible without auth per the RemoteStorage spec.
// Writing to "public/public-export.json" within the /savr/ scope puts the file at
// /savr/public/... which is private. Using a /public/savr/-scoped client is correct.
export const PUBLIC_EXPORT_FILENAME = "public-export.json";
const PUBLIC_CLIENT_SCOPE = "/public/savr/";

const STORAGE_KEY = "savr-public-export-state";
const DEBOUNCE_MS = 45_000;

export interface PublicExportPersistedState {
  enabled: boolean;
  dirty: boolean;
  publicUrl?: string;
  lastPublishedAt?: string;
  lastError?: string;
}

export interface PublicExportState extends PublicExportPersistedState {
  publishing: boolean;
}

let publishing = false;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
const listeners: Array<(state: PublicExportState) => void> = [];

function load(): PublicExportPersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { enabled: false, dirty: false, ...JSON.parse(raw) };
  } catch {
    // ignore
  }
  return { enabled: false, dirty: false };
}

function save(state: PublicExportPersistedState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
  notify();
}

function notify(): void {
  const state = getPublicExportState();
  listeners.forEach((l) => l(state));
}

export function getPublicExportState(): PublicExportState {
  return { ...load(), publishing };
}

export function subscribePublicExport(
  listener: (state: PublicExportState) => void
): () => void {
  listeners.push(listener);
  listener(getPublicExportState());
  return () => {
    const idx = listeners.indexOf(listener);
    if (idx !== -1) listeners.splice(idx, 1);
  };
}

export function markDirty(): void {
  const state = load();
  if (!state.enabled) return;
  state.dirty = true;
  save(state);
  scheduleDebouncedPublish();
}

function scheduleDebouncedPublish(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    doPublish().catch((e) => console.warn("Debounced publish failed:", e));
  }, DEBOUNCE_MS);
}

async function doPublish(): Promise<void> {
  const state = load();
  if (!state.enabled) return;
  if (publishing) return;

  publishing = true;
  notify();

  try {
    const storage = await init();
    const publicClient = storage.remoteStorage.scope(PUBLIC_CLIENT_SCOPE);
    const articles = await db.articles.toArray();
    const json = JSON.stringify(articles);

    await publicClient.storeFile("application/json", PUBLIC_EXPORT_FILENAME, json);

    const publicUrl = publicClient.getItemURL(PUBLIC_EXPORT_FILENAME) ?? state.publicUrl;

    const newState = load();
    newState.dirty = false;
    newState.lastPublishedAt = new Date().toISOString();
    newState.lastError = undefined;
    if (publicUrl) newState.publicUrl = publicUrl;
    save(newState);
  } catch (e) {
    const newState = load();
    newState.dirty = true;
    newState.lastError = e instanceof Error ? e.message : String(e);
    save(newState);
    throw e;
  } finally {
    publishing = false;
    notify();
  }
}

export async function enablePublicExport(): Promise<void> {
  const state = load();
  state.enabled = true;
  state.dirty = true;
  save(state);
  await doPublish().catch((e) => {
    console.warn("Initial publish on enable failed:", e);
  });
}

export async function disablePublicExport(): Promise<{
  success: boolean;
  error?: string;
}> {
  const state = load();
  state.enabled = false;
  state.dirty = false;
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  save(state);

  try {
    const storage = await init();
    const publicClient = storage.remoteStorage.scope(PUBLIC_CLIENT_SCOPE);
    await publicClient.remove(PUBLIC_EXPORT_FILENAME);
    const newState = load();
    newState.publicUrl = undefined;
    newState.lastError = undefined;
    save(newState);
    return { success: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("Failed to delete public-export.json:", msg);
    return { success: false, error: msg };
  }
}

export async function publishNow(): Promise<void> {
  await doPublish();
}

// On module load: if dirty+enabled, schedule debounced publish for after startup
(function checkOnLoad() {
  const state = load();
  if (state.enabled && state.dirty) {
    scheduleDebouncedPublish();
  }
})();
