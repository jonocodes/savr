import {
  DEFAULT_WPM,
  EMA_ALPHA,
  IDLE_TIMEOUT_MS,
  MAX_VALID_WPM,
  MIN_SESSION_SECONDS,
  MIN_VALID_WPM,
  MIN_WORDS_READ,
  ReadingSessionTracker,
  ReadingSpeedState,
  clampWpm,
  initialReadingSpeedState,
  updateReadingSpeed,
} from "../src/readingSpeed";
import { calcReadingTime } from "../src/lib";

describe("readingSpeed", () => {
  describe("ReadingSessionTracker", () => {
    it("accumulates active time between activity events", () => {
      const tracker = new ReadingSessionTracker(2000);
      // 0s: start at 0%, 30s: 50%, 60s: 100%
      tracker.recordActivity(0, 0);
      tracker.recordActivity(50, 30_000);
      tracker.recordActivity(100, 60_000);

      const session = tracker.getSession();
      expect(session).not.toBeNull();
      expect(session!.activeSeconds).toBe(60);
      // Covered 100% of 2000 words.
      expect(session!.wordsRead).toBe(2000);
    });

    it("the first event contributes no elapsed time", () => {
      const tracker = new ReadingSessionTracker(1000);
      tracker.recordActivity(0, 5_000); // lone event, no predecessor
      expect(tracker.getSession()!.activeSeconds).toBe(0);
    });

    it("caps idle gaps so time away from the page is not counted", () => {
      const tracker = new ReadingSessionTracker(1000, { idleTimeoutMs: 60_000 });
      tracker.recordActivity(0, 0);
      // A 10-minute gap (got up and left) should only count as the idle cap.
      tracker.recordActivity(40, 600_000);
      expect(tracker.getSession()!.activeSeconds).toBe(60);
    });

    it("uses the idle timeout default when not overridden", () => {
      const tracker = new ReadingSessionTracker(1000);
      tracker.recordActivity(0, 0);
      tracker.recordActivity(40, IDLE_TIMEOUT_MS * 5);
      expect(tracker.getSession()!.activeSeconds).toBe(IDLE_TIMEOUT_MS / 1000);
    });

    it("derives words read from the furthest progress reached", () => {
      const tracker = new ReadingSessionTracker(1000);
      tracker.recordActivity(20, 0);
      tracker.recordActivity(70, 30_000);
      // started at 20%, reached 70% -> 50% of 1000 words.
      expect(tracker.getSession()!.wordsRead).toBe(500);
    });

    it("does not penalize words read when the reader scrolls backwards", () => {
      const tracker = new ReadingSessionTracker(1000);
      tracker.recordActivity(0, 0);
      tracker.recordActivity(80, 20_000);
      tracker.recordActivity(30, 40_000); // scrolled back up to re-read
      // Furthest point was 80%.
      expect(tracker.getSession()!.wordsRead).toBe(800);
    });

    it("clamps progress into the 0-100 range", () => {
      const tracker = new ReadingSessionTracker(1000);
      tracker.recordActivity(-50, 0);
      tracker.recordActivity(150, 30_000);
      expect(tracker.getSession()!.wordsRead).toBe(1000);
    });

    it("returns null when no activity was recorded", () => {
      const tracker = new ReadingSessionTracker(1000);
      expect(tracker.getSession()).toBeNull();
    });

    it("ignores non-positive time gaps (clock jitter / duplicate events)", () => {
      const tracker = new ReadingSessionTracker(1000);
      tracker.recordActivity(0, 10_000);
      tracker.recordActivity(50, 5_000); // timestamp went backwards
      expect(tracker.getSession()!.activeSeconds).toBe(0);
    });
  });

  describe("updateReadingSpeed", () => {
    const base = (): ReadingSpeedState => initialReadingSpeedState();

    it("discards sessions shorter than the minimum duration", () => {
      const state = base();
      const next = updateReadingSpeed(state, {
        wordsRead: 500,
        activeSeconds: MIN_SESSION_SECONDS - 1,
      });
      expect(next).toEqual(state);
    });

    it("discards sessions that cover too few words", () => {
      const state = base();
      const next = updateReadingSpeed(state, {
        wordsRead: MIN_WORDS_READ - 1,
        activeSeconds: 60,
      });
      expect(next).toEqual(state);
    });

    it("discards an implausibly fast pace (skim / accidental fast-scroll)", () => {
      const state = base();
      // 5000 words in 20s -> 15000 wpm, well above MAX_VALID_WPM.
      const next = updateReadingSpeed(state, { wordsRead: 5000, activeSeconds: 20 });
      expect(next).toEqual(state);
    });

    it("discards an implausibly slow pace", () => {
      const state = base();
      // 60 words in 10 minutes -> 6 wpm, below MIN_VALID_WPM.
      const next = updateReadingSpeed(state, { wordsRead: 60, activeSeconds: 600 });
      expect(next).toEqual(state);
    });

    it("moves the estimate strongly toward the first valid sample", () => {
      const state = base(); // 200 wpm, 0 samples
      // 300 words in 60s -> exactly 300 wpm. First sample alpha = 1 -> full replace.
      const next = updateReadingSpeed(state, { wordsRead: 300, activeSeconds: 60 });
      expect(next.sampleCount).toBe(1);
      expect(next.wpm).toBeCloseTo(300, 5);
    });

    it("blends later samples with a decaying weight (EMA)", () => {
      let state: ReadingSpeedState = { wpm: 300, sampleCount: 10 };
      // Session pace 400 wpm; with 10 prior samples alpha = EMA_ALPHA floor.
      const next = updateReadingSpeed(state, { wordsRead: 400, activeSeconds: 60 });
      const expected = 300 * (1 - EMA_ALPHA) + 400 * EMA_ALPHA;
      expect(next.wpm).toBeCloseTo(expected, 5);
      expect(next.sampleCount).toBe(11);
    });

    it("converges toward a consistent pace over many sessions", () => {
      let state = base();
      for (let i = 0; i < 40; i++) {
        // Consistent 250 wpm: 250 words in 60s.
        state = updateReadingSpeed(state, { wordsRead: 250, activeSeconds: 60 });
      }
      expect(state.wpm).toBeCloseTo(250, 0);
      expect(state.sampleCount).toBe(40);
    });

    it("clamps the blended result into the valid band", () => {
      const state: ReadingSpeedState = { wpm: MAX_VALID_WPM, sampleCount: 50 };
      // A valid-but-fast session at the max edge keeps us within the band.
      const next = updateReadingSpeed(state, { wordsRead: MAX_VALID_WPM, activeSeconds: 60 });
      expect(next.wpm).toBeLessThanOrEqual(MAX_VALID_WPM);
      expect(next.wpm).toBeGreaterThanOrEqual(MIN_VALID_WPM);
    });

    it("rejects non-finite session inputs", () => {
      const state = base();
      expect(updateReadingSpeed(state, { wordsRead: NaN, activeSeconds: 60 })).toEqual(state);
      expect(updateReadingSpeed(state, { wordsRead: 300, activeSeconds: NaN })).toEqual(state);
      expect(updateReadingSpeed(state, { wordsRead: 300, activeSeconds: 0 })).toEqual(state);
    });
  });

  describe("clampWpm", () => {
    it("constrains values to the valid band", () => {
      expect(clampWpm(10)).toBe(MIN_VALID_WPM);
      expect(clampWpm(99999)).toBe(MAX_VALID_WPM);
      expect(clampWpm(250)).toBe(250);
    });
  });

  describe("calcReadingTime with custom wpm", () => {
    it("defaults to the baseline speed when no wpm is given", () => {
      const text = "word ".repeat(400).trim(); // 400 words
      expect(calcReadingTime(text)).toBe(Math.ceil(400 / DEFAULT_WPM));
    });

    it("uses the provided wpm when supplied", () => {
      const text = "word ".repeat(400).trim();
      expect(calcReadingTime(text, 100)).toBe(4);
      expect(calcReadingTime(text, 400)).toBe(1);
    });
  });

  describe("end-to-end: scroll session feeds the estimate", () => {
    it("turns a simulated read into an updated wpm", () => {
      // 1000-word article. Reader scrolls through it over ~4 minutes of active
      // reading (with one realistic idle gap that gets capped).
      const tracker = new ReadingSessionTracker(1000);
      let t = 0;
      tracker.recordActivity(0, t);
      t += 60_000;
      tracker.recordActivity(25, t);
      t += 60_000;
      tracker.recordActivity(50, t);
      // Reader gets distracted for 10 minutes (capped to the idle timeout).
      t += 600_000;
      tracker.recordActivity(75, t);
      t += 60_000;
      tracker.recordActivity(100, t);

      const session = tracker.getSession();
      expect(session).not.toBeNull();
      // active = 60 + 60 + 60 (idle cap) + 60 = 240s = 4 min, 1000 words -> 250 wpm.
      expect(session!.activeSeconds).toBe(240);
      expect(session!.wordsRead).toBe(1000);

      const next = updateReadingSpeed(initialReadingSpeedState(), session!);
      expect(next.wpm).toBeCloseTo(250, 5);
      expect(next.sampleCount).toBe(1);
    });
  });
});
