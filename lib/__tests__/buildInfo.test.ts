import {
  BUILD_TIMESTAMP,
  INGEST_PLATFORM,
  ingestPlatformFor,
  resolveBuildTimestamp,
} from "../src/buildInfo";

describe("buildInfo", () => {
  const now = new Date("2026-11-13T04:12:09.123Z");

  describe("resolveBuildTimestamp", () => {
    it("stamps a production build with its UTC time, to the second", () => {
      expect(resolveBuildTimestamp("build", undefined, now)).toBe("2026-11-13T04:12:09Z");
    });

    it("lets VITE_BUILD_TIMESTAMP pin the timestamp for reproducible builds", () => {
      expect(resolveBuildTimestamp("build", "2020-01-02T03:04:05Z", now)).toBe(
        "2020-01-02T03:04:05Z"
      );
    });

    it("gives the dev server no timestamp", () => {
      expect(resolveBuildTimestamp("serve", undefined, now)).toBeNull();
    });

    it("treats an empty override as unset", () => {
      expect(resolveBuildTimestamp("build", "", now)).toBe("2026-11-13T04:12:09Z");
    });
  });

  describe("ingestPlatformFor", () => {
    it("names the build an article was saved by", () => {
      expect(ingestPlatformFor("2026-11-13T04:12:09Z")).toBe(
        "typescript/web (2026-11-13T04:12:09Z)"
      );
    });

    it("says dev when there is no build", () => {
      expect(ingestPlatformFor(null)).toBe("typescript/web (dev)");
    });
  });

  it("has no build under Jest, so saves are stamped dev", () => {
    expect(BUILD_TIMESTAMP).toBeNull();
    expect(INGEST_PLATFORM).toBe("typescript/web (dev)");
  });
});
