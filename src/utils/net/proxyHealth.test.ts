import {
  classifyProbe,
  countProxiedRequest,
  createProxyHealthMonitor,
  getProxiedRequestsToday,
  probeProxy,
  proxyProblemMessage,
  type ProbeEvidence,
} from "./proxyHealth";

const PROXY = "https://proxy.example/?url=";

function fakeClock(start = 1_000_000) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

/**
 * A fetch stub that answers the CORS and no-cors probes separately. `reject`
 * models the browser's bare network TypeError.
 */
function probeFetch(cors: number | "reject", noCors: "resolve" | "reject") {
  return jest.fn(async (_url: string, init?: RequestInit) => {
    const outcome = init?.mode === "no-cors" ? noCors : cors;
    if (outcome === "reject") throw new TypeError("Failed to fetch");
    if (outcome === "resolve") return new Response(null, { status: 200 });
    return new Response("Missing 'url' parameter", { status: outcome });
  });
}

function evidence(partial: Partial<ProbeEvidence>): ProbeEvidence {
  return { at: 0, online: true, ...partial };
}

describe("probeProxy", () => {
  it("probes the proxy prefix itself (empty target) both with and without CORS", async () => {
    const fetchImpl = probeFetch(400, "resolve");
    await probeProxy(PROXY, { fetch: fetchImpl, isOnline: () => true });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    for (const [url] of fetchImpl.mock.calls) expect(url).toBe(PROXY);
    const modes = fetchImpl.mock.calls.map(([, init]) => init?.mode ?? "cors");
    expect(modes.sort()).toEqual(["cors", "no-cors"]);
  });

  it("records the CORS status and both outcomes as evidence", async () => {
    const clock = fakeClock(42);
    const result = await probeProxy(PROXY, {
      fetch: probeFetch(400, "resolve"),
      isOnline: () => true,
      now: clock.now,
    });
    expect(result).toEqual({
      at: 42,
      online: true,
      cors: { ok: true, status: 400 },
      noCors: { ok: true },
    });
  });

  it("records rejections with their message", async () => {
    const result = await probeProxy(PROXY, {
      fetch: probeFetch("reject", "reject"),
      isOnline: () => true,
    });
    expect(result.cors).toEqual({ ok: false, error: "TypeError: Failed to fetch" });
    expect(result.noCors).toEqual({ ok: false, error: "TypeError: Failed to fetch" });
  });

  it("does not touch the network while offline", async () => {
    const fetchImpl = probeFetch(400, "resolve");
    const result = await probeProxy(PROXY, { fetch: fetchImpl, isOnline: () => false });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.online).toBe(false);
    expect(classifyProbe(result)).toBe("offline");
  });
});

describe("classifyProbe", () => {
  it("CORS-reject + no-cors-resolve → responding but not working", () => {
    expect(
      classifyProbe(evidence({ cors: { ok: false, error: "x" }, noCors: { ok: true } }))
    ).toBe("not-working");
  });

  it("both reject while online → unreachable", () => {
    expect(
      classifyProbe(evidence({ cors: { ok: false, error: "x" }, noCors: { ok: false, error: "x" } }))
    ).toBe("unreachable");
  });

  it("offline → no proxy verdict", () => {
    expect(classifyProbe(evidence({ online: false }))).toBe("offline");
  });

  it.each([200, 400, 404, 500])("any CORS response (HTTP %i) → running", (status) => {
    expect(classifyProbe(evidence({ cors: { ok: true, status }, noCors: { ok: true } }))).toBe(
      "running"
    );
  });
});

describe("createProxyHealthMonitor", () => {
  function setup(fetchImpl: ReturnType<typeof probeFetch>, minProbeIntervalMs = 60_000) {
    const clock = fakeClock();
    const monitor = createProxyHealthMonitor({
      probe: () => probeProxy(PROXY, { fetch: fetchImpl, isOnline: () => true, now: clock.now }),
      now: clock.now,
      minProbeIntervalMs,
    });
    return { clock, monitor };
  }

  it("starts healthy", () => {
    const { monitor } = setup(probeFetch(400, "resolve"));
    expect(monitor.getState().problem).toBeNull();
  });

  it("blames the proxy when it answers without CORS headers", async () => {
    const { monitor } = setup(probeFetch("reject", "resolve"));
    await expect(monitor.diagnose()).resolves.toBe(true);
    expect(monitor.getState().problem).toBe("not-working");
    expect(monitor.getState().lastProbe?.verdict).toBe("not-working");
  });

  it("blames the proxy when it does not answer at all", async () => {
    const { monitor } = setup(probeFetch("reject", "reject"));
    await expect(monitor.diagnose()).resolves.toBe(true);
    expect(monitor.getState().problem).toBe("unreachable");
  });

  it("does not blame the proxy for a single bad target host", async () => {
    const { monitor } = setup(probeFetch(400, "resolve"));
    await expect(monitor.diagnose()).resolves.toBe(false);
    expect(monitor.getState().problem).toBeNull();
    expect(monitor.getState().lastProbe?.verdict).toBe("running");
  });

  it("gives no proxy verdict while offline", async () => {
    const clock = fakeClock();
    const fetchImpl = probeFetch("reject", "reject");
    const monitor = createProxyHealthMonitor({
      probe: () => probeProxy(PROXY, { fetch: fetchImpl, isOnline: () => false, now: clock.now }),
      now: clock.now,
    });
    await expect(monitor.diagnose()).resolves.toBe(false);
    expect(monitor.getState().problem).toBeNull();
  });

  it("coalesces concurrent diagnoses into one probe", async () => {
    const fetchImpl = probeFetch("reject", "resolve");
    const { monitor } = setup(fetchImpl);
    const results = await Promise.all([monitor.diagnose(), monitor.diagnose(), monitor.diagnose()]);
    expect(results).toEqual([true, true, true]);
    expect(fetchImpl).toHaveBeenCalledTimes(2); // one probe = CORS + no-cors
  });

  it("throttles probes, reusing the last verdict inside the window", async () => {
    const fetchImpl = probeFetch(400, "resolve");
    const { monitor, clock } = setup(fetchImpl, 60_000);
    await monitor.diagnose();
    clock.advance(59_000);
    await expect(monitor.diagnose()).resolves.toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    clock.advance(2_000);
    await monitor.diagnose();
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("a successful probe clears an earlier problem", async () => {
    let healthy = false;
    const clock = fakeClock();
    const monitor = createProxyHealthMonitor({
      probe: () =>
        probeProxy(PROXY, {
          fetch: healthy ? probeFetch(400, "resolve") : probeFetch("reject", "resolve"),
          isOnline: () => true,
          now: clock.now,
        }),
      now: clock.now,
      minProbeIntervalMs: 1_000,
    });
    await monitor.diagnose();
    expect(monitor.getState().problem).toBe("not-working");

    healthy = true;
    clock.advance(1_000);
    await monitor.diagnose();
    expect(monitor.getState().problem).toBeNull();
  });

  it("records a visible 429 as rate-limited", () => {
    const { monitor, clock } = setup(probeFetch(400, "resolve"));
    monitor.reportRateLimited(429);
    expect(monitor.getState()).toMatchObject({
      problem: "rate-limited",
      status: 429,
      observedAt: clock.now(),
    });
  });

  it("reportHealthy() clears the problem (breaker closed)", () => {
    const { monitor } = setup(probeFetch(400, "resolve"));
    monitor.reportRateLimited(429);
    monitor.reportHealthy();
    expect(monitor.getState().problem).toBeNull();
  });

  it("keeps the first observation time while the problem persists", async () => {
    const { monitor, clock } = setup(probeFetch("reject", "resolve"), 1_000);
    await monitor.diagnose();
    const first = monitor.getState().observedAt;
    clock.advance(5_000);
    await monitor.diagnose();
    expect(monitor.getState().observedAt).toBe(first);
  });

  it("reset() forgets the problem and the throttle", async () => {
    const fetchImpl = probeFetch("reject", "resolve");
    const { monitor } = setup(fetchImpl);
    await monitor.diagnose();
    monitor.reset();
    expect(monitor.getState().problem).toBeNull();
    expect(monitor.getState().lastProbe).toBeUndefined();
    await monitor.diagnose();
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("notifies subscribers on change, and stops after unsubscribe", async () => {
    const { monitor } = setup(probeFetch("reject", "resolve"));
    const listener = jest.fn();
    const unsubscribe = monitor.subscribe(listener);
    monitor.reportRateLimited(429);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    monitor.reportHealthy();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("returns a stable snapshot until something changes", () => {
    const { monitor } = setup(probeFetch(400, "resolve"));
    const a = monitor.getState();
    expect(monitor.getState()).toBe(a);
    monitor.reportHealthy(); // already healthy: no change
    expect(monitor.getState()).toBe(a);
    monitor.reportRateLimited(429);
    expect(monitor.getState()).not.toBe(a);
  });
});

describe("proxyProblemMessage", () => {
  it("says only what was observed", () => {
    expect(proxyProblemMessage("rate-limited", 429)).toBe(
      "Your CORS proxy is rate-limiting requests (HTTP 429)."
    );
    expect(proxyProblemMessage("not-working")).toBe(
      "Your CORS proxy is responding but not working. It may have hit a usage limit or be misconfigured."
    );
    expect(proxyProblemMessage("unreachable")).toBe(
      "Your CORS proxy isn't responding. Check the URL in Preferences."
    );
  });
});

describe("proxied request counter", () => {
  function memoryStorage(): Pick<Storage, "getItem" | "setItem"> {
    const map = new Map<string, string>();
    return {
      getItem: (key) => map.get(key) ?? null,
      setItem: (key, value) => {
        map.set(key, value);
      },
    };
  }

  it("counts requests per local day and restarts on a new day", () => {
    const store = memoryStorage();
    const day1 = new Date(2026, 9, 15, 10).getTime();
    const day2 = new Date(2026, 9, 16, 9).getTime();

    expect(getProxiedRequestsToday(store, day1)).toBe(0);
    countProxiedRequest(store, day1);
    countProxiedRequest(store, day1, 2);
    expect(getProxiedRequestsToday(store, day1)).toBe(3);

    expect(getProxiedRequestsToday(store, day2)).toBe(0);
    countProxiedRequest(store, day2);
    expect(getProxiedRequestsToday(store, day2)).toBe(1);
  });

  it("tolerates corrupt or missing storage", () => {
    const store = memoryStorage();
    store.setItem("savr-proxy-requests", "not json");
    expect(getProxiedRequestsToday(store, 0)).toBe(0);
    expect(getProxiedRequestsToday(null, 0)).toBe(0);
    expect(() => countProxiedRequest(null, 0)).not.toThrow();
  });
});
