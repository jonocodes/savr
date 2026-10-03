import {
  backoffDelayMs,
  classifyStatus,
  createFetchGovernor,
  createMemoryOutcomeStore,
  GovernorError,
  type BackoffConfig,
  type OutcomeStore,
} from "./fetchGovernor";

function fakeClock(start = 1_000_000) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

function ok(body = "ok"): Response {
  return new Response(body, { status: 200 });
}

function attemptReturning(response: Response) {
  return jest.fn(async () => response);
}

describe("classifyStatus", () => {
  it("treats 2xx as ok", () => {
    expect(classifyStatus(200)).toBe("ok");
    expect(classifyStatus(204)).toBe("ok");
  });

  it("treats 4xx (except 408/429) as permanent", () => {
    expect(classifyStatus(400)).toBe("permanent");
    expect(classifyStatus(404)).toBe("permanent");
    expect(classifyStatus(410)).toBe("permanent");
  });

  it("treats 408/429/5xx/0 as transient", () => {
    expect(classifyStatus(408)).toBe("transient");
    expect(classifyStatus(429)).toBe("transient");
    expect(classifyStatus(500)).toBe("transient");
    expect(classifyStatus(503)).toBe("transient");
    expect(classifyStatus(0)).toBe("transient");
  });
});

describe("backoffDelayMs", () => {
  const config: BackoffConfig = { baseMs: 100, factor: 2, maxMs: 1000, jitter: 0 };

  it("grows exponentially and clamps at maxMs", () => {
    const random = () => 0.5;
    expect(backoffDelayMs(1, config, random)).toBe(100);
    expect(backoffDelayMs(2, config, random)).toBe(200);
    expect(backoffDelayMs(3, config, random)).toBe(400);
    expect(backoffDelayMs(4, config, random)).toBe(800);
    expect(backoffDelayMs(5, config, random)).toBe(1000);
    expect(backoffDelayMs(50, config, random)).toBe(1000);
  });

  it("applies symmetric jitter", () => {
    const jittered: BackoffConfig = { ...config, jitter: 0.2 };
    expect(backoffDelayMs(1, jittered, () => 0)).toBe(80);
    expect(backoffDelayMs(1, jittered, () => 1)).toBe(120);
  });
});

describe("createFetchGovernor", () => {
  let store: OutcomeStore;

  beforeEach(() => {
    store = createMemoryOutcomeStore();
  });

  it("fetches once on success and leaves no history", async () => {
    const clock = fakeClock();
    const governor = createFetchGovernor({ store, now: clock.now });
    const attempt = attemptReturning(ok("hello"));

    const response = await governor.run({ key: "https://a/1", requestUrl: "https://a/1" }, attempt);

    expect(await response.text()).toBe("hello");
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(await store.get("https://a/1")).toBeUndefined();
  });

  it("coalesces concurrent fetches of the same key into one request", async () => {
    const clock = fakeClock();
    const governor = createFetchGovernor({ store, now: clock.now });

    let release!: (response: Response) => void;
    const gate = new Promise<Response>((resolve) => {
      release = resolve;
    });
    const attempt = jest.fn(() => gate);

    const first = governor.run({ key: "https://a/same", requestUrl: "https://a/same" }, attempt);
    const second = governor.run({ key: "https://a/same", requestUrl: "https://a/same" }, attempt);

    release(ok("body"));
    const [r1, r2] = await Promise.all([first, second]);

    expect(attempt).toHaveBeenCalledTimes(1);
    expect(await r1.text()).toBe("body");
    expect(await r2.text()).toBe("body");
  });

  it("records a 404 as permanent and refuses to retry it", async () => {
    const clock = fakeClock();
    const governor = createFetchGovernor({ store, now: clock.now, permanentTtlMs: 1000 });
    const attempt = attemptReturning(new Response("nope", { status: 404 }));

    const response = await governor.run({ key: "https://a/missing", requestUrl: "https://a/missing" }, attempt);
    expect(response.status).toBe(404);

    const outcome = await store.get("https://a/missing");
    expect(outcome).toMatchObject({ class: "permanent", status: 404, attempts: 1 });
    expect(outcome!.nextAttemptAt).toBe(clock.now() + 1000);

    await expect(
      governor.run({ key: "https://a/missing", requestUrl: "https://a/missing" }, attempt)
    ).rejects.toMatchObject({ name: "GovernorError", reason: "permanent" });
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it("allows a permanent failure to be retried after its TTL", async () => {
    const clock = fakeClock();
    const governor = createFetchGovernor({ store, now: clock.now, permanentTtlMs: 1000 });
    const attempt = attemptReturning(new Response("nope", { status: 404 }));

    await governor.run({ key: "k", requestUrl: "k" }, attempt);
    clock.advance(1001);
    await governor.run({ key: "k", requestUrl: "k" }, attempt);

    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it("backs off transient failures and retries once the window passes", async () => {
    const clock = fakeClock();
    const governor = createFetchGovernor({
      store,
      now: clock.now,
      backoff: { baseMs: 5000, jitter: 0 },
    });
    const attempt = attemptReturning(new Response("boom", { status: 500 }));

    await governor.run({ key: "https://a/flaky", requestUrl: "https://a/flaky" }, attempt);
    const outcome = await store.get("https://a/flaky");
    expect(outcome).toMatchObject({ class: "transient", status: 500, attempts: 1 });

    await expect(
      governor.run({ key: "https://a/flaky", requestUrl: "https://a/flaky" }, attempt)
    ).rejects.toMatchObject({ name: "GovernorError", reason: "backoff" });
    expect(attempt).toHaveBeenCalledTimes(1);

    clock.advance(5001);
    await governor.run({ key: "https://a/flaky", requestUrl: "https://a/flaky" }, attempt);
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it("clears failure history and resets the breaker after a success", async () => {
    const clock = fakeClock();
    const governor = createFetchGovernor({
      store,
      now: clock.now,
      backoff: { baseMs: 5000, jitter: 0 },
    });
    const fail = attemptReturning(new Response("boom", { status: 500 }));
    await governor.run({ key: "k", requestUrl: "k" }, fail);
    expect(await store.get("k")).toBeDefined();

    clock.advance(5001);
    const succeed = attemptReturning(ok());
    await governor.run({ key: "k", requestUrl: "k" }, succeed);

    expect(await store.get("k")).toBeUndefined();
    // A following call is allowed immediately (no backoff left).
    await governor.run({ key: "k", requestUrl: "k" }, succeed);
    expect(succeed).toHaveBeenCalledTimes(2);
  });

  it("treats a thrown network error as transient", async () => {
    const clock = fakeClock();
    const governor = createFetchGovernor({ store, now: clock.now, backoff: { baseMs: 1000, jitter: 0 } });
    const attempt = jest.fn(async () => {
      throw new Error("Network error: Failed to fetch");
    });

    await expect(governor.run({ key: "k", requestUrl: "k" }, attempt)).rejects.toThrow("Network error");
    expect(await store.get("k")).toMatchObject({ class: "transient", status: undefined, attempts: 1 });
  });

  it("opens a circuit breaker on 429 and short-circuits other keys", async () => {
    const clock = fakeClock();
    const governor = createFetchGovernor({
      store,
      now: clock.now,
      breaker: { baseMs: 60_000 },
    });
    const rateLimited = attemptReturning(new Response("", { status: 429 }));

    await governor.run({ key: "a", requestUrl: "a" }, rateLimited);

    const untouched = jest.fn(async () => ok());
    await expect(governor.run({ key: "b", requestUrl: "b" }, untouched)).rejects.toMatchObject({
      name: "GovernorError",
      reason: "circuit-open",
    });
    expect(untouched).not.toHaveBeenCalled();

    clock.advance(60_001);
    await governor.run({ key: "b", requestUrl: "b" }, untouched);
    expect(untouched).toHaveBeenCalledTimes(1);
  });

  it("isolates keys from each other", async () => {
    const clock = fakeClock();
    const governor = createFetchGovernor({ store, now: clock.now });
    const failing = attemptReturning(new Response("nope", { status: 404 }));
    const passing = attemptReturning(ok());

    await governor.run({ key: "bad", requestUrl: "bad" }, failing);
    await governor.run({ key: "good", requestUrl: "good" }, passing);

    expect(await store.get("bad")).toBeDefined();
    expect(await store.get("good")).toBeUndefined();
  });

  it("clear() forgets a key's history", async () => {
    const clock = fakeClock();
    const governor = createFetchGovernor({ store, now: clock.now, permanentTtlMs: 1000 });
    const attempt = attemptReturning(new Response("nope", { status: 404 }));

    await governor.run({ key: "k", requestUrl: "k" }, attempt);
    await governor.clear("k");

    await governor.run({ key: "k", requestUrl: "k" }, attempt);
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it("clearAll() forgets every key", async () => {
    const clock = fakeClock();
    const governor = createFetchGovernor({ store, now: clock.now, permanentTtlMs: 1000 });
    const attempt = attemptReturning(new Response("nope", { status: 404 }));

    await governor.run({ key: "a", requestUrl: "a" }, attempt);
    await governor.run({ key: "b", requestUrl: "b" }, attempt);
    await governor.clearAll();

    await governor.run({ key: "a", requestUrl: "a" }, attempt);
    await governor.run({ key: "b", requestUrl: "b" }, attempt);
    expect(attempt).toHaveBeenCalledTimes(4);
  });

  it("throws GovernorError instances", async () => {
    const clock = fakeClock();
    const governor = createFetchGovernor({ store, now: clock.now, permanentTtlMs: 1000 });
    const attempt = attemptReturning(new Response("", { status: 410 }));
    await governor.run({ key: "k", requestUrl: "k" }, attempt);

    await expect(governor.run({ key: "k", requestUrl: "k" }, attempt)).rejects.toBeInstanceOf(
      GovernorError
    );
  });
});
