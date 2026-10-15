import { shareArticle } from "./share";

type NavigatorStub = {
  share?: (data: ShareData) => Promise<void>;
  clipboard?: { writeText: (text: string) => Promise<void> };
};

const realNavigator = globalThis.navigator;

function stubNavigator(stub: NavigatorStub) {
  Object.defineProperty(globalThis, "navigator", {
    value: stub,
    configurable: true,
  });
}

afterEach(() => {
  Object.defineProperty(globalThis, "navigator", {
    value: realNavigator,
    configurable: true,
  });
});

describe("shareArticle", () => {
  it("opens the system share sheet with the title and url", async () => {
    const share = jest.fn().mockResolvedValue(undefined);
    const writeText = jest.fn().mockResolvedValue(undefined);
    stubNavigator({ share, clipboard: { writeText } });

    const outcome = await shareArticle("https://example.com/a", "An article");

    expect(outcome).toBe("shared");
    expect(share).toHaveBeenCalledWith({ title: "An article", url: "https://example.com/a" });
    expect(writeText).not.toHaveBeenCalled();
  });

  it("shares without a title when the article has none", async () => {
    const share = jest.fn().mockResolvedValue(undefined);
    stubNavigator({ share, clipboard: { writeText: jest.fn() } });

    await shareArticle("https://example.com/a");

    expect(share).toHaveBeenCalledWith({ url: "https://example.com/a" });
  });

  it("reports a cancelled share without copying anything", async () => {
    const abort = Object.assign(new Error("The user aborted a request."), {
      name: "AbortError",
    });
    const share = jest.fn().mockRejectedValue(abort);
    const writeText = jest.fn();
    stubNavigator({ share, clipboard: { writeText } });

    const outcome = await shareArticle("https://example.com/a", "An article");

    expect(outcome).toBe("cancelled");
    expect(writeText).not.toHaveBeenCalled();
  });

  it("falls back to the clipboard when sharing fails", async () => {
    const share = jest.fn().mockRejectedValue(new Error("No share targets"));
    const writeText = jest.fn().mockResolvedValue(undefined);
    stubNavigator({ share, clipboard: { writeText } });

    const outcome = await shareArticle("https://example.com/a", "An article");

    expect(outcome).toBe("copied");
    expect(writeText).toHaveBeenCalledWith("https://example.com/a");
  });

  it("copies to the clipboard where the Web Share API is unavailable", async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    stubNavigator({ clipboard: { writeText } });

    const outcome = await shareArticle("https://example.com/a");

    expect(outcome).toBe("copied");
    expect(writeText).toHaveBeenCalledWith("https://example.com/a");
  });

  it("reports failure when neither sharing nor the clipboard works", async () => {
    stubNavigator({
      clipboard: { writeText: jest.fn().mockRejectedValue(new Error("denied")) },
    });

    expect(await shareArticle("https://example.com/a")).toBe("failed");
  });
});
