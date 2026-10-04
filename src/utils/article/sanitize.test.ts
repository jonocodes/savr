import createDOMPurify from "dompurify";
import { createArticleSanitizer, isAllowedVideoEmbed } from "./sanitize";

// jsdom ships without types and @types/jsdom isn't a dependency; the repo's
// other DOM-backed tests use an untyped require for the same reason.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { JSDOM } = require("jsdom");

// The app's sanitizer is wired to the browser-bound DOMPurify default. In tests
// there is no global window, so build a jsdom-backed purifier and inject it.
const { window } = new JSDOM("", { url: "https://savr.link" });
const sanitize = createArticleSanitizer(createDOMPurify(window));

describe("isAllowedVideoEmbed", () => {
  it.each([
    "https://www.youtube.com/embed/dQw4w9WgXcQ",
    "https://youtube.com/embed/dQw4w9WgXcQ",
    "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    "https://player.vimeo.com/video/12345",
    "https://player.twitch.tv/?channel=x",
    "https://www.dailymotion.com/embed/video/x123",
    "https://archive.org/embed/foo",
  ])("allows %s", (src) => {
    expect(isAllowedVideoEmbed(src)).toBe(true);
  });

  it.each([
    "https://evil.example.com/phish",
    "https://example.com/youtube.com.evil.test",
    "javascript:alert(1)",
    "about:blank",
    "",
    null,
    undefined,
  ])("rejects %s", (src) => {
    expect(isAllowedVideoEmbed(src)).toBe(false);
  });
});

describe("sanitizeArticleHtml", () => {
  it("keeps a YouTube embed, preserving player attributes", () => {
    const html =
      '<iframe width="560" height="315" src="https://www.youtube.com/embed/dQw4w9WgXcQ" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay" allowfullscreen></iframe>';
    const out = sanitize(html);

    expect(out).toContain("<iframe");
    expect(out).toContain('src="https://www.youtube.com/embed/dQw4w9WgXcQ"');
    expect(out).toContain("allowfullscreen");
    expect(out).toContain('allow="accelerometer; autoplay"');
  });

  it("keeps a Vimeo embed", () => {
    const out = sanitize('<iframe src="https://player.vimeo.com/video/12345"></iframe>');
    expect(out).toContain("<iframe");
    expect(out).toContain("player.vimeo.com/video/12345");
  });

  it("drops iframes that are not recognised video embeds", () => {
    const out = sanitize(
      '<p>before</p><iframe src="https://evil.example.com/phish"></iframe><p>after</p>'
    );
    expect(out).not.toContain("<iframe");
    expect(out).toContain("before");
    expect(out).toContain("after");
  });

  it("drops srcdoc and javascript: iframes", () => {
    const out = sanitize(
      '<iframe srcdoc="<script>alert(1)</script>"></iframe><iframe src="javascript:alert(1)"></iframe>'
    );
    expect(out).not.toContain("<iframe");
    expect(out).not.toContain("alert(1)");
  });

  it("keeps embed frames alongside regular article content", () => {
    const out = sanitize(
      '<p>intro</p><iframe src="https://www.youtube.com/embed/abc"></iframe><p>body</p>'
    );
    expect(out).toContain("<p>intro</p>");
    expect(out).toContain("<iframe");
    expect(out).toContain("<p>body</p>");
  });

  it("still strips scripts", () => {
    const out = sanitize('<p>hi</p><script>alert("xss")</script>');
    expect(out).not.toContain("<script");
    expect(out).not.toContain("alert");
  });

  it("preserves the reader stylesheet link (existing ADD_TAGS behaviour)", () => {
    const out = sanitize('<div>hi</div><link rel="stylesheet" href="/web.css">');
    expect(out).toContain('rel="stylesheet"');
    expect(out).toContain('href="/web.css"');
  });
});
