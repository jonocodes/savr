import { fetchAvailableModels } from "./summarization";

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  jest.clearAllMocks();
});

function mockFetch(payload: unknown, ok = true, status = 200) {
  const response = {
    ok,
    status,
    statusText: ok ? "OK" : "Bad Request",
    json: async () => payload,
  };
  global.fetch = jest.fn().mockResolvedValue(response) as unknown as typeof fetch;
  return global.fetch as unknown as jest.Mock;
}

describe("fetchAvailableModels", () => {
  it("returns sorted, de-duplicated models and parses x_savr estimates", async () => {
    mockFetch({
      data: [
        { id: "b", x_savr: { neurons_per_summary: 28.3, summaries_per_day: 353 } },
        { id: "a" },
        { id: "a" },
        { id: "models/c" },
        { id: 42 },
        null,
      ],
    });

    const models = await fetchAvailableModels("custom", "key", "https://x/v1/chat/completions");

    expect(models).toEqual([
      { id: "a" },
      { id: "b", estimate: { neuronsPerSummary: 28.3, summariesPerDay: 353 } },
      { id: "c" },
    ]);
  });

  it("omits the estimate when the extension is malformed", async () => {
    mockFetch({ data: [{ id: "a", x_savr: { summaries_per_day: "lots" } }] });
    const models = await fetchAvailableModels("custom", "key", "https://x/v1/chat/completions");
    expect(models).toEqual([{ id: "a" }]);
  });

  it("derives the /models URL and sends the bearer key", async () => {
    const spy = mockFetch({ data: [] });
    await fetchAvailableModels("custom", "secret", "https://x/v1/chat/completions");
    expect(spy).toHaveBeenCalledWith("https://x/v1/models", {
      headers: { Authorization: "Bearer secret" },
    });
  });

  it("surfaces the provider error message on a failed response", async () => {
    mockFetch({ error: { message: "nope" } }, false, 400);
    await expect(
      fetchAvailableModels("custom", "k", "https://x/v1/chat/completions")
    ).rejects.toThrow("nope");
  });

  it("rejects an endpoint that cannot be mapped to /models", async () => {
    await expect(fetchAvailableModels("custom", "k", "https://x/not-chat")).rejects.toThrow(
      /chat\/completions/
    );
  });
});
