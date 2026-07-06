# Changelog

## 2026-07-06

- AI summarization now works with any OpenAI-compatible chat-completions endpoint via a single config-driven call path
- Added Gemini as a built-in summarization provider (via its OpenAI-compatible endpoint)
- Added a "Local / Custom" provider so summaries can run against a local server (llama.cpp, Ollama, LM Studio, vLLM) or any compatible service by entering a base URL and model name; API key optional
- Updated the default Groq model to Qwen3 32B (Groq is deprecating the Llama 3.3 70B model)
- Scaled the summary output-token limit by detail level (was a fixed 1000), fixing summaries that were cut off — notably with "thinking" models like Gemini 2.5 that spend part of the token budget on reasoning
- Summary failure toasts now include the underlying provider error instead of a generic message

## 2026-06-20

- Added "Reading styles" bottom drawer consolidating font size and theme controls into a single button (#55)
- Added font family selector to reading styles drawer (#55)
- Implemented adaptive reading speed estimation that learns your WPM from scroll behavior using exponential moving average (#54)
- Reading speed syncs across devices via article metadata to bootstrap estimates on new devices (#54)
- Added reading time and word count display in the article info drawer (#54)
- Migrated DB schema to store raw word count instead of derived read time, enabling flexible per-user estimates (#54)

## 2026-06-17

- Security: HTML content now sanitized with DOMPurify; XSS hardening in article templates; `javascript:` URLs blocked (#53)
- Security: postMessage handlers now validate origin; bookmarklet handler gains try/catch (#53)
- Security: LLM API keys moved from cookies to localStorage; redacted in diagnostics dump (#53)
- Fixed slug collisions — hash suffix only appended on actual conflict, not always (#53)
- Fixed race condition in metadata writes using patch-over-latest-record instead of whole-object replace (#53)
- Removed ~5,900 lines of dead code, unused packages, and stale documentation (#53)
- Reorganized `src/utils/` into domain subdirectories (`sync/`, `article/`, `ai/`, `ui/`, `net/`) (#53)
- Added lint, typecheck, and e2e smoke job to CI (#53)

## 2026-06-12

- Fixed debug mode inadvertently enabled in production builds due to truthy string check (#52)
- Stabilized RemoteStorageProvider context with `useMemo` to prevent article reloading mid-read during background syncs (#52)

## 2026-06-11

- Added comprehensive dark mode support for article content: code blocks, blockquotes, tables, links, and form inputs (#51)
- Replaced hardcoded colors with semantic MUI theme tokens and rgba values (#51)

## 2026-05-18

- Sync redesign: parallel reconcile, per-worker test isolation, improved diagnostics (#50)
- Fixed race conditions in bookmarklet and article-persistence sync (#50)
- Fixed spinner stuck-on bug after sync completes (#50)
- Fixed cross-browser article deletion when delete guard fires (#50)

## 2026-05-12

- Promoted dev → main: storage metrics persistence, summary UI improvements, Docker config (#49)

## 2026-02-18

- Removed Clicky analytics tracking scripts (#45)

## 2026-02-13

- Persist asset count and file size during ingestion so storage display requires no on-demand calculation (#44)
- Switched storage size display to use browser-native `navigator.storage.estimate()` for accuracy (#42)
- Show article count and total file count separately in catalog size view (#42)

## 2026-02-07

- Standardized read time format to compact notation: `22m`, `2h 30m`, `2d 2h` (#39)
- Article list in diagnostics screen now scrolls independently with sticky headers (#39)

## 2026-01-30

- Injected "View Summary" link next to reading time in article content (#38)
- Summary drawer now respects light/dark theme with proper MUI color tokens (#38)

## 2026-01-29

- Added AI summarization via cloud APIs (Groq/OpenAI) with configurable detail level, format, tone, and focus (#29)
- API keys stored in cookies; provider and model selectable in Preferences (#29)
- Added text-to-speech with chunked playback, mobile/iOS compatibility, and audio unlocking (#23, #30)
- Added Markdown and plain text import support with auto-detection on the Submit page (#32)
- Added PDF ingestion and viewing via iframe (#35)
- Added file upload for PDFs and text documents on the Submit page (#36)
- Added ingestion log viewer inside the article info drawer (#34)

## 2026-01-28

- Added "Refetch" option to re-ingest an article from its original URL while preserving reading progress (#27)

## 2026-01-27

- Re-enabled "Edit Info" menu item in article view (#25)
- Fixed after-save action preference not being passed through to save functions (#28)

## 2026-01-24

- Fixed sync behavior that was incorrectly clearing local articles on connect (#20)

## 2026-01-21

- Force sync completes before bookmarklet window closes, preventing dangling remote storage directories (#18)

## 2026-01-20

- Fixed dangling remote storage directories caused by missing article.json write in bookmarklet ingestion (#16)

## 2026-01-17

- Page title now shows unread article count as `Savr (x)` (#14)
- Added article count and total reading time summary at top of article list (#14)

## 2026-01-15

- Faster article sync with improved e2e test coverage (#12, #13)

## 2026-01-12

- Added WiFi-only sync preference to avoid syncing on cellular (#8)
- Fixed WiFi sync indicator for mobile browsers (#8)

## 2026-01-09

- Show network connection info (type, bandwidth, latency, data saver) in diagnostics using Network Information API (#7)

## 2025-11-14

- Added cross-origin bookmarklet support (#6)

## 2025-08-08

- Migrated from Expo to TanStack Router (#3)

## 2025-04-19

- Added RemoteStorage support and converted to a PWA; removed Android/Kotlin codebase (#2)

## 2025-04-08

- Adopted Expo as the primary framework; archived old Kotlin codebase to a separate branch (#1)

---

## Prompt for generating new entries

Use this prompt after merging a PR. Paste it into Claude along with the PR description.

---

I just merged a PR into my project "savr" (a read-it-later app). Below is the PR description. Please generate a CHANGELOG.md entry for it in the same style as the existing entries in my CHANGELOG.md:

- Date heading as `## YYYY-MM-DD`
- 3–6 bullet points max, distilled from the PR description
- Each bullet is one clear sentence describing what changed from a user or developer perspective
- Include the PR number in parentheses at the end of each bullet, e.g. `(#99)`
- Skip internal/test-only changes unless they're significant
- No sub-headings, no bold, no nested bullets

PR description:
[paste PR body here]
