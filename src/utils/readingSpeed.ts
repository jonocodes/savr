import { useEffect, useState } from "react";
import {
  DEFAULT_WPM,
  ReadingSession,
  ReadingSpeedState,
  bootstrapReadingSpeed,
  initialReadingSpeedState,
  sessionWpm,
  updateReadingSpeed,
} from "../../lib/src/readingSpeed";

/**
 * Persistence + React glue for the adaptive reading-speed estimate.
 *
 * The learned estimate lives in localStorage (it updates frequently and is
 * device-local, so a cookie would be the wrong tool). A custom window event is
 * dispatched on every change so screens can react live — mirroring the
 * SYNC_SETTING_EVENT pattern used elsewhere in the app.
 */

export const READING_SPEED_STORAGE_KEY = "savr-reading-speed";
export const READING_SPEED_EVENT = "savr:reading-speed-changed";

export const getReadingSpeedState = (): ReadingSpeedState => {
  if (typeof localStorage === "undefined") return initialReadingSpeedState();
  try {
    const raw = localStorage.getItem(READING_SPEED_STORAGE_KEY);
    if (!raw) return initialReadingSpeedState();
    const parsed = JSON.parse(raw);
    if (typeof parsed?.wpm === "number" && typeof parsed?.sampleCount === "number") {
      return { wpm: parsed.wpm, sampleCount: parsed.sampleCount };
    }
  } catch {
    // Corrupt value — fall back to the default below.
  }
  return initialReadingSpeedState();
};

export const getReadingWpm = (): number => getReadingSpeedState().wpm;

const setReadingSpeedState = (state: ReadingSpeedState): void => {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(READING_SPEED_STORAGE_KEY, JSON.stringify(state));
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(READING_SPEED_EVENT, { detail: state }));
  }
};

/**
 * Fold a completed reading session into the stored estimate. Returns the new
 * local state plus the session's measured pace (null when the session was too
 * noisy to learn from) — the caller persists that pace on the article so other
 * devices can bootstrap from it.
 */
export const recordReadingSession = (
  session: ReadingSession
): { state: ReadingSpeedState; wpm: number | null } => {
  const next = updateReadingSpeed(getReadingSpeedState(), session);
  setReadingSpeedState(next);
  return { state: next, wpm: sessionWpm(session) };
};

/**
 * Seed the local estimate from reading speeds measured on other devices (synced
 * via article metadata) — but only when this device has not learned anything
 * itself yet, so we never clobber a locally-built estimate. Returns true if a
 * bootstrap was applied.
 */
export const bootstrapReadingSpeedIfUnseeded = (
  articleWpms: Array<number | null | undefined>
): boolean => {
  if (getReadingSpeedState().sampleCount > 0) return false;
  const seeded = bootstrapReadingSpeed(articleWpms);
  if (seeded.sampleCount === 0) return false;
  setReadingSpeedState(seeded);
  return true;
};

/** Reset the estimate back to the default baseline. */
export const resetReadingSpeed = (): void => setReadingSpeedState(initialReadingSpeedState());

/** React hook that re-renders when the learned reading speed changes. */
export const useReadingWpm = (): number => {
  const [wpm, setWpm] = useState<number>(() => getReadingWpm());
  useEffect(() => {
    const handler = () => setWpm(getReadingWpm());
    window.addEventListener(READING_SPEED_EVENT, handler);
    return () => window.removeEventListener(READING_SPEED_EVENT, handler);
  }, []);
  return wpm;
};

export { DEFAULT_WPM };
