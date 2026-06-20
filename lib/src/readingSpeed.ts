/**
 * Adaptive reading-speed estimation.
 *
 * The app ships with a fixed baseline reading speed (DEFAULT_WPM). As the user
 * actually reads articles we measure their real pace and fold it into a personal
 * words-per-minute (WPM) estimate using an exponential moving average (EMA).
 *
 * Everything in this module is pure and DOM-free, so the behaviour can be unit
 * tested by feeding in synthetic streams of (progress, timestamp) events rather
 * than driving a real browser.
 */

/** Baseline reading speed used before we have learned anything about the user. */
export const DEFAULT_WPM = 200;

/**
 * Session paces outside this band are treated as noise (skimming, accidental
 * fast-scroll, a tab left open) and are not folded into the estimate.
 */
export const MIN_VALID_WPM = 50;
export const MAX_VALID_WPM = 1000;

/**
 * A gap between activity events longer than this is treated as the reader being
 * idle (got up, switched tabs, etc.). Only this much of the gap is counted as
 * active reading time, so time away from the page cannot inflate the estimate.
 */
export const IDLE_TIMEOUT_MS = 60_000;

/** Sessions shorter / smaller than these thresholds are too noisy to learn from. */
export const MIN_SESSION_SECONDS = 10;
export const MIN_WORDS_READ = 50;

/**
 * Floor for the EMA weight of a new sample once we have plenty of history.
 * Early samples are weighted more heavily (see {@link updateReadingSpeed}) so the
 * estimate moves off the default quickly and then settles.
 */
export const EMA_ALPHA = 0.15;

export interface ReadingSpeedState {
  /** Current learned estimate in words per minute. */
  wpm: number;
  /** Number of valid sessions folded in so far (drives confidence weighting). */
  sampleCount: number;
}

export const initialReadingSpeedState = (): ReadingSpeedState => ({
  wpm: DEFAULT_WPM,
  sampleCount: 0,
});

export interface ReadingSession {
  /** Words the reader is estimated to have covered this session. */
  wordsRead: number;
  /** Active (non-idle) seconds spent reading. */
  activeSeconds: number;
}

/** Clamp a WPM value into the sane band. */
export const clampWpm = (wpm: number): number =>
  Math.min(MAX_VALID_WPM, Math.max(MIN_VALID_WPM, wpm));

/**
 * The measured pace of a single session, or null when the session is too short,
 * covers too few words, or implies an out-of-band pace (skim, fast-scroll, a tab
 * left open). This is the value worth persisting per-article so other devices
 * can bootstrap an estimate from it.
 */
export function sessionWpm(session: ReadingSession): number | null {
  const { wordsRead, activeSeconds } = session;

  if (!Number.isFinite(activeSeconds) || activeSeconds < MIN_SESSION_SECONDS) return null;
  if (!Number.isFinite(wordsRead) || wordsRead < MIN_WORDS_READ) return null;

  const wpm = wordsRead / (activeSeconds / 60);
  if (!Number.isFinite(wpm)) return null;
  if (wpm < MIN_VALID_WPM || wpm > MAX_VALID_WPM) return null;

  return wpm;
}

/**
 * Fold a completed reading session into the running estimate.
 *
 * Returns the state unchanged when the session pace is not valid (see
 * {@link sessionWpm}). Otherwise blends the session pace in via an EMA whose
 * weight starts high (so the first samples dominate) and decays toward
 * {@link EMA_ALPHA} as the sample count grows.
 */
export function updateReadingSpeed(
  state: ReadingSpeedState,
  session: ReadingSession
): ReadingSpeedState {
  const wpm = sessionWpm(session);
  if (wpm === null) return state;

  // Weight the first few samples heavily so we leave the default behind quickly,
  // then settle into a stable EMA once there is enough history.
  const alpha = Math.max(EMA_ALPHA, 1 / (state.sampleCount + 1));
  const blended = state.wpm * (1 - alpha) + wpm * alpha;

  return {
    wpm: clampWpm(blended),
    sampleCount: state.sampleCount + 1,
  };
}

/**
 * Build an initial estimate from per-article reading speeds gathered on other
 * devices (synced via article metadata). Out-of-band values are ignored. With
 * no usable samples the default baseline is returned, so a brand-new account
 * still starts somewhere sensible.
 *
 * The resulting sampleCount reflects how many readings informed the estimate,
 * which keeps local sessions from over-correcting a well-supported baseline.
 */
export function bootstrapReadingSpeed(wpms: Array<number | null | undefined>): ReadingSpeedState {
  const valid = wpms.filter(
    (w): w is number => typeof w === "number" && w >= MIN_VALID_WPM && w <= MAX_VALID_WPM
  );

  if (valid.length === 0) return initialReadingSpeedState();

  const mean = valid.reduce((sum, w) => sum + w, 0) / valid.length;
  return {
    wpm: clampWpm(mean),
    sampleCount: valid.length,
  };
}


export interface ReadingSessionTrackerOptions {
  /** Override the idle cap (mainly for tests). Defaults to {@link IDLE_TIMEOUT_MS}. */
  idleTimeoutMs?: number;
}

/**
 * Accumulates active reading time and reading progress from a stream of activity
 * events (scrolls, taps). The tracker is fed (progress, timestamp) pairs as the
 * reader moves through an article; it caps long idle gaps and derives the words
 * covered from how far progress advanced, producing a {@link ReadingSession}
 * suitable for {@link updateReadingSpeed}.
 */
export class ReadingSessionTracker {
  private readonly wordCount: number;
  private readonly idleTimeoutMs: number;
  private activeMs = 0;
  private lastEventMs: number | null = null;
  private startProgress: number | null = null;
  private maxProgress = 0;

  constructor(wordCount: number, options: ReadingSessionTrackerOptions = {}) {
    this.wordCount = Math.max(0, wordCount);
    this.idleTimeoutMs = options.idleTimeoutMs ?? IDLE_TIMEOUT_MS;
  }

  /**
   * Record reader activity at the given progress (0–100) and timestamp (ms).
   * Time since the previous event is added to the active total, capped at the
   * idle timeout so time spent away from the page is not counted as reading.
   * The first event establishes the starting point and contributes no time.
   */
  recordActivity(progressPercent: number, nowMs: number): void {
    const progress = Math.min(100, Math.max(0, progressPercent));

    if (this.lastEventMs !== null) {
      const gap = nowMs - this.lastEventMs;
      if (gap > 0) {
        this.activeMs += Math.min(gap, this.idleTimeoutMs);
      }
    }
    this.lastEventMs = nowMs;

    if (this.startProgress === null) this.startProgress = progress;
    if (progress > this.maxProgress) this.maxProgress = progress;
  }

  /**
   * Snapshot the session so far. Returns null when no activity was recorded.
   * Words read are derived from the furthest point reached relative to the
   * start, so scrolling backwards does not reduce the count.
   */
  getSession(): ReadingSession | null {
    if (this.startProgress === null) return null;
    const progressDelta = Math.max(0, this.maxProgress - this.startProgress);
    const wordsRead = (progressDelta / 100) * this.wordCount;
    return {
      wordsRead,
      activeSeconds: this.activeMs / 1000,
    };
  }
}
