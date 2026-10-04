/**
 * Fetch governor — polite re-fetching of the same URL.
 *
 * Every proxied request in Savr funnels through one place
 * (`fetchWithTimeout`). That made it easy for repeated reads, re-renders and
 * re-ingests to hammer the same failing URL forever: a handful of 404ing
 * images generated ~234k requests against the shared CORS worker in a single
 * day, exhausting its free-tier quota.
 *
 * The governor sits in front of the network call and adds:
 *
 *  - in-flight coalescing: concurrent fetches of the same key share one request
 *  - a persisted outcome cache: a URL that failed is not retried until its
 *    `nextAttemptAt` passes (permanent failures wait longest)
 *  - backoff: transient failures (timeout/network/5xx/429) retry with
 *    exponential backoff + jitter; permanent failures (404/410/…) do not
 *  - a circuit breaker: a proxy-level failure (HTTP 429) short-circuits all
 *    fetches for a cooldown, so a capped proxy cannot be hammered
 *
 * The module is intentionally free of browser and Dexie imports so it can be
 * unit-tested in a bare Node environment; persistence is injected through the
 * `OutcomeStore` port.
 */

export type FetchClass = "ok" | "permanent" | "transient";

export interface FetchOutcome {
  /** Logical resource identity — the target URL, not the proxied request URL. */
  key: string;
  class: "permanent" | "transient";
  /** HTTP status, when the browser exposed one. */
  status?: number;
  /** Consecutive failures recorded for this key. */
  attempts: number;
  /** When the failure was last recorded (epoch ms). */
  storedAt: number;
  /** Earliest time the key may be fetched again (epoch ms). */
  nextAttemptAt: number;
}

export interface OutcomeStore {
  get(key: string): Promise<FetchOutcome | undefined>;
  put(outcome: FetchOutcome): Promise<void>;
  delete(key: string): Promise<void>;
  /** Optional: forget all history (used by an explicit user retry). */
  clear?(): Promise<void>;
}

export interface GovernedRequest {
  /** Logical identity used for caching/coalescing, e.g. the target URL. */
  key: string;
  /** URL actually fetched, proxy included. */
  requestUrl: string;
}

export type GovernorReason = "permanent" | "backoff" | "circuit-open";

/**
 * Thrown when the governor refuses to make a network call. Callers can read
 * `reason`/`nextAttemptAt` to tell a known-bad URL from a temporary backoff or
 * an open circuit breaker.
 */
export class GovernorError extends Error {
  readonly reason: GovernorReason;
  readonly nextAttemptAt?: number;
  readonly status?: number;

  constructor(
    reason: GovernorReason,
    message: string,
    options: { nextAttemptAt?: number; status?: number; cause?: unknown } = {}
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "GovernorError";
    this.reason = reason;
    this.nextAttemptAt = options.nextAttemptAt;
    this.status = options.status;
  }
}

export interface BackoffConfig {
  /** Delay after the first failure, in ms. */
  baseMs: number;
  /** Multiplier applied per additional attempt. */
  factor: number;
  /** Upper bound on the delay, in ms. */
  maxMs: number;
  /** Fraction of the delay applied as +/- jitter (0 = none). */
  jitter: number;
}

export interface BreakerConfig {
  /** Cooldown after the first trip, in ms. */
  baseMs: number;
  /** Upper bound on the cooldown, in ms. */
  maxMs: number;
}

export type GovernorEvent =
  | { type: "coalesced"; key: string }
  | { type: "skipped"; key: string; reason: FetchOutcome["class"]; nextAttemptAt: number }
  | { type: "circuit-open"; key: string; nextAttemptAt: number }
  | { type: "recorded"; key: string; class: FetchOutcome["class"]; status?: number; attempts: number; nextAttemptAt: number }
  | { type: "cleared"; key: string }
  | { type: "breaker-open"; nextAttemptAt: number }
  | { type: "breaker-close" };

export interface GovernorOptions {
  store: OutcomeStore;
  now?: () => number;
  random?: () => number;
  backoff?: Partial<BackoffConfig>;
  breaker?: Partial<BreakerConfig>;
  permanentTtlMs?: number;
  onEvent?: (event: GovernorEvent) => void;
}

export interface FetchGovernor {
  /** Fetch `request.requestUrl`, governed by `request.key`'s history. */
  run(
    request: GovernedRequest,
    attempt: (requestUrl: string) => Promise<Response>
  ): Promise<Response>;
  /** Forget a key's failure history (e.g. an explicit user retry). */
  clear(key: string): Promise<void>;
  /** Forget all failure history (e.g. an explicit "Refetch" of an article). */
  clearAll(): Promise<void>;
}

export const DEFAULT_BACKOFF: BackoffConfig = {
  baseMs: 5_000,
  factor: 2,
  maxMs: 5 * 60_000,
  jitter: 0.2,
};

export const DEFAULT_BREAKER: BreakerConfig = {
  baseMs: 60_000,
  maxMs: 30 * 60_000,
};

export const DEFAULT_PERMANENT_TTL_MS = 7 * 24 * 60 * 60_000;

/**
 * Classify an HTTP status. 4xx (except 408/429) means "this URL is not going
 * to start working" — do not retry it on our own. Everything else is assumed
 * transient.
 */
export function classifyStatus(status: number): FetchClass {
  if (status >= 200 && status < 300) return "ok";
  if (status === 408 || status === 429 || status >= 500) return "transient";
  if (status >= 400) return "permanent";
  // 0 (opaque/CORS-filtered), 3xx that slipped through, etc.
  return "transient";
}

/** Like {@link classifyStatus}, but for a response/error that is not ok. */
function classifyFailureStatus(status: number): FetchOutcome["class"] {
  return classifyStatus(status) === "permanent" ? "permanent" : "transient";
}

/** Exponential backoff with symmetric jitter, clamped to `maxMs`. */
export function backoffDelayMs(
  attempts: number,
  config: BackoffConfig,
  random: () => number
): number {
  const exponent = Math.max(0, attempts - 1);
  const raw = Math.min(config.maxMs, config.baseMs * Math.pow(config.factor, exponent));
  const jitter = raw * config.jitter * (random() * 2 - 1);
  return Math.max(0, Math.round(raw + jitter));
}

/** In-memory store, used in tests and as an SSR/no-IndexedDB fallback. */
export function createMemoryOutcomeStore(
  seed: FetchOutcome[] = []
): OutcomeStore {
  const map = new Map<string, FetchOutcome>();
  for (const outcome of seed) map.set(outcome.key, outcome);
  return {
    async get(key) {
      return map.get(key);
    },
    async put(outcome) {
      map.set(outcome.key, outcome);
    },
    async delete(key) {
      map.delete(key);
    },
    async clear() {
      map.clear();
    },
  };
}

function getErrorStatus(error: unknown): number | undefined {
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status?: unknown }).status;
    if (typeof status === "number") return status;
  }
  return undefined;
}

export function createFetchGovernor(options: GovernorOptions): FetchGovernor {
  const { store, now = () => Date.now(), random = Math.random, onEvent } = options;
  const backoff: BackoffConfig = { ...DEFAULT_BACKOFF, ...options.backoff };
  const breaker: BreakerConfig = { ...DEFAULT_BREAKER, ...options.breaker };
  const permanentTtlMs = options.permanentTtlMs ?? DEFAULT_PERMANENT_TTL_MS;

  const inflight = new Map<string, Promise<Response>>();
  let breakerUntil = 0;
  let breakerTrips = 0;

  const emit = (event: GovernorEvent) => onEvent?.(event);

  async function recordFailure(
    key: string,
    cls: FetchOutcome["class"],
    status: number | undefined,
    previousAttempts: number
  ): Promise<number> {
    const attempts = previousAttempts + 1;
    const timestamp = now();
    const nextAttemptAt =
      cls === "permanent"
        ? timestamp + permanentTtlMs
        : timestamp + backoffDelayMs(attempts, backoff, random);
    await store.put({ key, class: cls, status, attempts, storedAt: timestamp, nextAttemptAt });
    emit({ type: "recorded", key, class: cls, status, attempts, nextAttemptAt });
    return nextAttemptAt;
  }

  function tripBreaker(): void {
    breakerTrips += 1;
    const cooldown = Math.min(breaker.maxMs, breaker.baseMs * Math.pow(2, breakerTrips - 1));
    breakerUntil = now() + cooldown;
    emit({ type: "breaker-open", nextAttemptAt: breakerUntil });
  }

  function resetBreaker(): void {
    if (breakerUntil !== 0 || breakerTrips !== 0) {
      breakerUntil = 0;
      breakerTrips = 0;
      emit({ type: "breaker-close" });
    }
  }

  async function run(
    request: GovernedRequest,
    attempt: (requestUrl: string) => Promise<Response>
  ): Promise<Response> {
    const timestamp = now();

    if (timestamp < breakerUntil) {
      emit({ type: "circuit-open", key: request.key, nextAttemptAt: breakerUntil });
      throw new GovernorError("circuit-open", "CORS proxy temporarily unavailable.", {
        nextAttemptAt: breakerUntil,
      });
    }

    const cached = await store.get(request.key);
    if (cached && timestamp < cached.nextAttemptAt) {
      const reason: GovernorReason = cached.class === "permanent" ? "permanent" : "backoff";
      emit({ type: "skipped", key: request.key, reason: cached.class, nextAttemptAt: cached.nextAttemptAt });
      throw new GovernorError(
        reason,
        cached.class === "permanent"
          ? `Skipping known-failing URL (HTTP ${cached.status ?? "?"}).`
          : `Backing off after ${cached.attempts} failed attempt(s).`,
        { nextAttemptAt: cached.nextAttemptAt, status: cached.status }
      );
    }

    const existing = inflight.get(request.key);
    if (existing) {
      emit({ type: "coalesced", key: request.key });
      return existing.then((response) => response.clone());
    }

    const previousAttempts = cached?.attempts ?? 0;
    const task = (async (): Promise<Response> => {
      try {
        const response = await attempt(request.requestUrl);
        if (response.ok) {
          await store.delete(request.key);
          resetBreaker();
          emit({ type: "cleared", key: request.key });
          return response;
        }
        const cls = classifyFailureStatus(response.status);
        await recordFailure(request.key, cls, response.status, previousAttempts);
        if (response.status === 429) tripBreaker();
        return response;
      } catch (error) {
        const status = getErrorStatus(error);
        const cls = classifyFailureStatus(status ?? 0);
        await recordFailure(request.key, cls, status, previousAttempts);
        if (status === 429) tripBreaker();
        throw error;
      } finally {
        inflight.delete(request.key);
      }
    })();

    inflight.set(request.key, task);
    return task.then((response) => response.clone());
  }

  async function clear(key: string): Promise<void> {
    await store.delete(key);
  }

  async function clearAll(): Promise<void> {
    await store.clear?.();
  }

  return { run, clear, clearAll };
}
