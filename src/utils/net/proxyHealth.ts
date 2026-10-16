/**
 * CORS proxy health — notice when the proxy itself has stopped working and
 * say what was observed (#86).
 *
 * The free Cloudflare plan caps a worker at 100k requests/day; past that the
 * edge answers with its own error page (1027) instead of running our worker.
 * That page has no `Access-Control-Allow-Origin` header, so the browser
 * reports a bare network `TypeError` and the app never sees a status — the
 * governor's 429 breaker can't trip on it.
 *
 * Our worker adds CORS headers to every response it produces, errors included.
 * So when a proxied fetch fails at the network level we probe the proxy prefix
 * itself (empty target, e.g. `https://…/?url=`), which our worker answers with
 * a CORS 400:
 *
 *  - CORS fetch answers 429                    → the proxy is rate-limiting
 *  - CORS fetch resolves (any other status)    → running; the target failed
 *  - CORS rejects, `no-cors` fetch resolves    → something answered that is
 *    not our code: likely exhausted, or the worker crashed
 *  - both reject while online                  → unreachable
 *  - offline                                   → no verdict
 *
 * A visible 429 is probed the same way: the worker passes a target's own
 * status through, so only the probe can tell "the proxy is rate-limiting"
 * (probe gets 429) from "this site is" (probe gets the usual 400).
 *
 * Pure: fetch, clock and storage are injected so this runs in bare Node.
 */

export type ProbeOutcome = { ok: true; status?: number } | { ok: false; error: string };

export interface ProbeEvidence {
  /** When the probe ran (epoch ms). */
  at: number;
  /** `navigator.onLine` at probe time; offline probes skip the network. */
  online: boolean;
  /** Normal CORS fetch of the proxy prefix. */
  cors?: ProbeOutcome;
  /** `mode: "no-cors"` fetch: resolves whenever the server answered at all. */
  noCors?: ProbeOutcome;
}

export type ProbeVerdict = "running" | "rate-limited" | "not-working" | "unreachable" | "offline";

export type ProxyProblem = "rate-limited" | "not-working" | "unreachable";

export interface ProxyHealthState {
  problem: ProxyProblem | null;
  /** When the current problem was first observed (epoch ms). */
  observedAt?: number;
  /** HTTP status behind the problem, when one was visible (429). */
  status?: number;
  /** The most recent probe, kept as raw evidence for Diagnostics. */
  lastProbe?: { evidence: ProbeEvidence; verdict: ProbeVerdict };
}

export interface ProbeDeps {
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  isOnline: () => boolean;
  now?: () => number;
  timeoutMs?: number;
}

function describeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

async function attemptProbe(
  url: string,
  init: RequestInit,
  deps: ProbeDeps
): Promise<ProbeOutcome> {
  try {
    const response = await deps.fetch(url, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(deps.timeoutMs ?? 5000),
    });
    // An opaque no-cors response always reports status 0; leave it out.
    return init.mode === "no-cors" ? { ok: true } : { ok: true, status: response.status };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}

/** Probe `proxy` (the configured prefix, target left empty) two ways. */
export async function probeProxy(proxy: string, deps: ProbeDeps): Promise<ProbeEvidence> {
  const at = (deps.now ?? Date.now)();
  if (!deps.isOnline()) return { at, online: false };
  const [cors, noCors] = await Promise.all([
    attemptProbe(proxy, {}, deps),
    attemptProbe(proxy, { mode: "no-cors" }, deps),
  ]);
  return { at, online: true, cors, noCors };
}

export function classifyProbe(evidence: ProbeEvidence): ProbeVerdict {
  if (!evidence.online) return "offline";
  // Any response carrying CORS headers (400, 404, …) means our code answered.
  // A token-locked proxy's 404 for a bad token lands here too: running, but
  // misconfigured — the per-URL statuses already show that.
  if (evidence.cors?.ok) return evidence.cors.status === 429 ? "rate-limited" : "running";
  return evidence.noCors?.ok ? "not-working" : "unreachable";
}

export interface ProxyHealthMonitorOptions {
  probe: () => Promise<ProbeEvidence>;
  now?: () => number;
  /** Minimum gap between probes; inside it the last verdict is reused. */
  minProbeIntervalMs?: number;
}

export interface ProxyHealthMonitor {
  getState(): ProxyHealthState;
  subscribe(listener: () => void): () => void;
  /**
   * A proxied fetch failed with no visible status, or with a 429. Probe
   * (throttled and coalesced) and resolve `true` when the proxy itself is at
   * fault.
   */
  diagnose(): Promise<boolean>;
  /** A response came back through the proxy / the breaker closed. */
  reportHealthy(): void;
  /** Forget everything, e.g. after the proxy setting changed. */
  reset(): void;
}

/** Matches the governor's base breaker cooldown: one probe per breaker cycle. */
export const DEFAULT_MIN_PROBE_INTERVAL_MS = 60_000;

export function createProxyHealthMonitor(options: ProxyHealthMonitorOptions): ProxyHealthMonitor {
  const { probe, now = () => Date.now() } = options;
  const minProbeIntervalMs = options.minProbeIntervalMs ?? DEFAULT_MIN_PROBE_INTERVAL_MS;
  const listeners = new Set<() => void>();
  let state: ProxyHealthState = { problem: null };
  let inflight: Promise<boolean> | null = null;
  // Bumped by reset() so a probe that was in flight can't write stale state.
  let generation = 0;

  function setState(next: ProxyHealthState): void {
    state = next;
    for (const listener of listeners) listener();
  }

  function withProblem(problem: ProxyProblem | null, status?: number): ProxyHealthState {
    if (problem === null) return { problem: null, lastProbe: state.lastProbe };
    return {
      problem,
      observedAt: state.problem === problem ? state.observedAt : now(),
      status,
      lastProbe: state.lastProbe,
    };
  }

  function isBlamed(verdict: ProbeVerdict | undefined): boolean {
    return verdict === "rate-limited" || verdict === "not-working" || verdict === "unreachable";
  }

  async function runProbe(): Promise<boolean> {
    const started = generation;
    const evidence = await probe();
    if (started !== generation) return false;
    const verdict = classifyProbe(evidence);
    const lastProbe = { evidence, verdict };
    if (verdict === "offline") {
      setState({ ...state, lastProbe });
    } else if (verdict === "running") {
      setState({ problem: null, lastProbe });
    } else {
      const status = verdict === "rate-limited" ? 429 : undefined;
      setState({ ...withProblem(verdict, status), lastProbe });
    }
    return isBlamed(verdict);
  }

  function diagnose(): Promise<boolean> {
    if (inflight) return inflight;
    const last = state.lastProbe;
    if (last && last.verdict !== "offline" && now() - last.evidence.at < minProbeIntervalMs) {
      return Promise.resolve(isBlamed(last.verdict));
    }
    inflight = runProbe().finally(() => {
      inflight = null;
    });
    return inflight;
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    diagnose,
    reportHealthy() {
      if (state.problem !== null) setState(withProblem(null));
    },
    reset() {
      generation += 1;
      inflight = null;
      if (state.problem !== null || state.lastProbe) setState({ problem: null });
    },
  };
}

/** User-facing copy: what was observed, cause hedged, no reset times. */
export function proxyProblemMessage(problem: ProxyProblem, status = 429): string {
  switch (problem) {
    case "rate-limited":
      return `Your CORS proxy is rate-limiting requests (HTTP ${status}).`;
    case "not-working":
      return "Your CORS proxy is responding but not working. It may have hit a usage limit or be misconfigured.";
    case "unreachable":
      return "Your CORS proxy isn't responding. Check the URL in Preferences.";
  }
}

/** The same observation as a clause, for "Couldn't save: …" notices. */
export function proxyProblemSummary(problem: ProxyProblem): string {
  switch (problem) {
    case "rate-limited":
      return "your CORS proxy is rate-limiting requests";
    case "not-working":
      return "your CORS proxy isn't working";
    case "unreachable":
      return "your CORS proxy isn't responding";
  }
}

/**
 * Per-device count of requests sent to the proxy today — only a hint next to
 * the message, since other devices share the same proxy.
 */
export const PROXY_REQUEST_COUNT_KEY = "savr-proxy-requests";

type CounterStorage = Pick<Storage, "getItem" | "setItem">;

function localDay(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export function getProxiedRequestsToday(storage: CounterStorage | null, now: number): number {
  if (!storage) return 0;
  try {
    const parsed = JSON.parse(storage.getItem(PROXY_REQUEST_COUNT_KEY) ?? "null");
    if (parsed?.day === localDay(now) && typeof parsed.count === "number") return parsed.count;
  } catch {
    // Corrupt value: start over.
  }
  return 0;
}

export function countProxiedRequest(storage: CounterStorage | null, now: number, by = 1): void {
  if (!storage) return;
  const count = getProxiedRequestsToday(storage, now) + by;
  try {
    storage.setItem(PROXY_REQUEST_COUNT_KEY, JSON.stringify({ day: localDay(now), count }));
  } catch {
    // Storage full or unavailable: the count is only a hint.
  }
}
