/**
 * Make a hand-typed URL fetchable.
 *
 * People type "example.com/article" rather than "https://example.com/article";
 * `fetch` would otherwise resolve it relative to the app origin (and the CORS
 * proxy would receive a schemeless string). Anything that already carries a
 * scheme is left exactly as typed.
 */
export function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  // An explicit scheme always has `//` after it: https://, ftp://, ...
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed;
  // `host:port/...` looks scheme-like but is a bare host with a port.
  if (/^[a-z][a-z0-9+.-]*:\d/i.test(trimmed)) return `https://${trimmed}`;
  // Other schemes carry no `//`: mailto:, data:, tel:, ...
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}
