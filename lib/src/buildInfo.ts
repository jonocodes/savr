/**
 * Which build of the app is running. Savr has no version numbers (#68): a
 * build is identified by the UTC time it was built, which `vite build` bakes
 * in as the `__BUILD_TIMESTAMP__` constant (see `vite.config.ts`). The dev
 * server, Jest and Storybook have no build, so there it is absent.
 */
declare const __BUILD_TIMESTAMP__: string | undefined;

/** The build's UTC timestamp, e.g. `2026-11-13T04:12:09Z`; null outside a build. */
export const BUILD_TIMESTAMP: string | null =
  typeof __BUILD_TIMESTAMP__ === "string" && __BUILD_TIMESTAMP__ !== ""
    ? __BUILD_TIMESTAMP__
    : null;

/** The `ingestPlatform` stamped on articles saved by the given build. */
export function ingestPlatformFor(buildTimestamp: string | null): string {
  return `typescript/web (${buildTimestamp ?? "dev"})`;
}

/** The `ingestPlatform` stamped on every article this build saves. */
export const INGEST_PLATFORM = ingestPlatformFor(BUILD_TIMESTAMP);

/**
 * The timestamp `vite.config.ts` bakes in: an explicit `VITE_BUILD_TIMESTAMP`
 * wins (reproducible builds), otherwise the time of a `vite build`, to the
 * second. The dev server gets none, so its saves say "dev" instead of
 * claiming to be a build.
 */
export function resolveBuildTimestamp(
  command: "build" | "serve",
  override: string | undefined,
  now: Date
): string | null {
  if (override) return override;
  if (command !== "build") return null;
  return now.toISOString().replace(/\.\d{3}Z$/, "Z");
}
