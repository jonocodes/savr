export type ShareOutcome = "shared" | "cancelled" | "copied" | "failed";

export async function shareArticle(url: string, title?: string): Promise<ShareOutcome> {
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share(title ? { title, url } : { url });
      return "shared";
    } catch (error) {
      if ((error as { name?: string })?.name === "AbortError") {
        return "cancelled";
      }
    }
  }

  try {
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    return "failed";
  }
}
