import {
  getCookieValue,
  isSyncEnabled,
  isArticlePage,
  shouldShowWidget,
} from "../../src/utils/widgetVisibility";

describe("widgetVisibility", () => {
  describe("getCookieValue", () => {
    it("should return cookie value when cookie exists", () => {
      const cookieString = "savr-sync-enabled=true; other-cookie=value";
      expect(getCookieValue(cookieString, "savr-sync-enabled")).toBe("true");
    });

    it("should return cookie value for cookies in the middle", () => {
      const cookieString = "first=1; savr-sync-enabled=false; last=3";
      expect(getCookieValue(cookieString, "savr-sync-enabled")).toBe("false");
    });

    it("should return null when cookie does not exist", () => {
      const cookieString = "other-cookie=value";
      expect(getCookieValue(cookieString, "savr-sync-enabled")).toBeNull();
    });

    it("should return null for empty cookie string", () => {
      expect(getCookieValue("", "savr-sync-enabled")).toBeNull();
    });

    it("should handle cookies with similar names correctly", () => {
      const cookieString = "savr-sync-enabled-other=value; savr-sync-enabled=true";
      expect(getCookieValue(cookieString, "savr-sync-enabled")).toBe("true");
    });
  });

  describe("isSyncEnabled", () => {
    it("should return true when cookie value is 'true'", () => {
      expect(isSyncEnabled("true")).toBe(true);
    });

    it("should return false when cookie value is 'false'", () => {
      expect(isSyncEnabled("false")).toBe(false);
    });

    it("should default to true when cookie value is null", () => {
      expect(isSyncEnabled(null)).toBe(true);
    });

    it("should return false for any value other than 'true'", () => {
      expect(isSyncEnabled("")).toBe(false);
      expect(isSyncEnabled("yes")).toBe(false);
      expect(isSyncEnabled("1")).toBe(false);
    });
  });

  describe("isArticlePage", () => {
    it("should return true for article pages", () => {
      expect(isArticlePage("/article/my-article-slug")).toBe(true);
      expect(isArticlePage("/article/123")).toBe(true);
      expect(isArticlePage("/article/test-article")).toBe(true);
    });

    it("should return false for non-article pages", () => {
      expect(isArticlePage("/")).toBe(false);
      expect(isArticlePage("/preferences")).toBe(false);
      expect(isArticlePage("/submit")).toBe(false);
    });

    it("should return false for paths that contain article but don't start with /article/", () => {
      expect(isArticlePage("/my-article")).toBe(false);
      expect(isArticlePage("/articles/list")).toBe(false);
      expect(isArticlePage("/some/article/path")).toBe(false);
    });

    it("should return false for partial /article paths", () => {
      expect(isArticlePage("/article")).toBe(false);
      expect(isArticlePage("/articlefoo")).toBe(false);
    });
  });

  describe("shouldShowWidget", () => {
    it("should return true when sync is enabled and not on article page", () => {
      expect(shouldShowWidget(true, "/")).toBe(true);
      expect(shouldShowWidget(true, "/preferences")).toBe(true);
    });

    it("should return false when sync is disabled", () => {
      expect(shouldShowWidget(false, "/")).toBe(false);
      expect(shouldShowWidget(false, "/preferences")).toBe(false);
    });

    it("should return false when on article page (even if sync is enabled)", () => {
      expect(shouldShowWidget(true, "/article/my-article")).toBe(false);
      expect(shouldShowWidget(true, "/article/123")).toBe(false);
    });

    it("should return false when sync is disabled AND on article page", () => {
      expect(shouldShowWidget(false, "/article/my-article")).toBe(false);
    });
  });

  describe("integration: cookie to widget visibility", () => {
    it("should correctly determine widget visibility from cookie string and pathname", () => {
      // Helper function to simulate the full flow
      const getWidgetVisibility = (cookieString: string, pathname: string): boolean => {
        const cookieValue = getCookieValue(cookieString, "savr-sync-enabled");
        const syncEnabled = isSyncEnabled(cookieValue);
        return shouldShowWidget(syncEnabled, pathname);
      };

      // Sync enabled, on home page - show widget
      expect(getWidgetVisibility("savr-sync-enabled=true", "/")).toBe(true);

      // Sync enabled, on article page - hide widget
      expect(getWidgetVisibility("savr-sync-enabled=true", "/article/test")).toBe(false);

      // Sync disabled, on home page - hide widget
      expect(getWidgetVisibility("savr-sync-enabled=false", "/")).toBe(false);

      // No cookie (defaults to enabled), on home page - show widget
      expect(getWidgetVisibility("", "/")).toBe(true);

      // No cookie (defaults to enabled), on article page - hide widget
      expect(getWidgetVisibility("", "/article/test")).toBe(false);
    });
  });
});
