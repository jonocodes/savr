import { test, expect, Page } from "@playwright/test";
import zlib from "node:zlib";
import {
  connectToRemoteStorage,
  waitForRemoteStorageSync,
  getWorkerStorageAddress,
  getWorkerToken,
} from "./utils/remotestorage-helper";
import { loadTestEnv } from "./utils/test-helpers";

/* eslint-disable @typescript-eslint/no-explicit-any */

const testEnv = loadTestEnv();

/**
 * Repro harness for "the article bounces a second or two after I stop
 * scrolling on mobile". The 1s debounced progress writer in ArticleScreen is
 * the only timer that fires in that window, so each test scrolls, stops, and
 * then samples the viewport long enough to cover the write and the liveQuery
 * re-render it triggers.
 *
 * Instrumentation distinguishes the two possible causes:
 *   - programmatic scroll (window.scrollTo / scrollTop) -> stack is captured
 *   - layout shift above the viewport -> PerformanceObserver("layout-shift")
 */

const SLUG = "scroll-stability-article";

type Sample = { t: number; y: number; docH: number; innerH: number };
type Probe = {
  samples: Sample[];
  scrollCalls: { t: number; args: string; stack: string }[];
  shifts: { t: number; value: number }[];
};

/** Minimal RGB PNG encoder so the late-image test loads a real, decodable image. */
function makePng(width: number, height: number): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = (buf: Buffer) => {
    let crc = 0xffffffff;
    for (const b of buf) crc = crcTable[(crc ^ b) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const typed = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typed));
    return Buffer.concat([len, typed, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x++) {
    row[1 + x * 3] = 100;
    row[2 + x * 3] = 150;
    row[3 + x * 3] = 200;
  }
  const raw = Buffer.concat(Array.from({ length: height }, () => row));

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Patch scroll APIs and watch layout shifts before the article renders. */
async function installProbe(page: Page) {
  await page.addInitScript(() => {
    const w = window as any;
    w.__scrollCalls = [];
    w.__shifts = [];
    const t0 = performance.now();

    const record = (name: string, args: any[]) => {
      w.__scrollCalls.push({
        t: Math.round(performance.now() - t0),
        args: `${name}(${args.map((a) => JSON.stringify(a)).join(", ")})`,
        stack: new Error().stack ?? "",
      });
    };

    const origScrollTo = window.scrollTo.bind(window);
    window.scrollTo = function (...args: any[]) {
      record("window.scrollTo", args);
      return (origScrollTo as any)(...args);
    } as any;

    const origScroll = window.scroll.bind(window);
    window.scroll = function (...args: any[]) {
      record("window.scroll", args);
      return (origScroll as any)(...args);
    } as any;

    const origScrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (this: Element, ...args: any[]) {
      record("scrollIntoView", args);
      return (origScrollIntoView as any).apply(this, args);
    } as any;

    // document.scrollingElement.scrollTop = N is another way to move the page.
    const desc = Object.getOwnPropertyDescriptor(Element.prototype, "scrollTop")!;
    Object.defineProperty(Element.prototype, "scrollTop", {
      configurable: true,
      get() {
        return desc.get!.call(this);
      },
      set(v) {
        if (this === document.documentElement || this === document.body) {
          record("documentElement.scrollTop=", [v]);
        }
        return desc.set!.call(this, v);
      },
    });

    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as any[]) {
          w.__shifts.push({ t: Math.round(entry.startTime - t0), value: entry.value });
        }
      }).observe({ type: "layout-shift", buffered: true });
    } catch {
      /* layout-shift unsupported */
    }
  });
}

async function seedArticle(
  page: Page,
  opts: { progress: number; withImages: boolean }
) {
  await page.waitForFunction(
    () => !!(window as any).savrDb && !!(window as any).remoteStorageClient,
    { timeout: 20000 }
  );

  await page.evaluate(
    async ({ slug, progress, withImages }) => {
      const db = (window as any).savrDb;
      const client = (window as any).remoteStorageClient;

      const body = Array.from({ length: 120 }, (_, i) => {
        const para = `<p>Paragraph ${i}. ${"The quick brown fox jumps over the lazy dog. ".repeat(12)}</p>`;
        // Images without intrinsic dimensions are a classic late-layout-shift
        // source; include some to see whether they explain the bounce.
        return withImages && i % 10 === 5
          ? `${para}\n<img src="https://via.placeholder.com/600x400?i=${i}" alt="figure ${i}">`
          : para;
      }).join("\n");

      const html = `<h1>Scroll Stability</h1>
        <div id="savr-metadata"><div id="savr-readTime">10 min read</div></div>
        ${body}`;

      await client.storeFile("text/html", `saves/${slug}/index.html`, html);
      await db.articles.put({
        slug,
        title: "Scroll Stability",
        url: "https://example.com/scroll-stability",
        state: "unread",
        ingestDate: new Date().toISOString(),
        mimeType: "text/html",
        readTimeMinutes: 10,
        progress,
        ingestPlatform: "web",
        ingestSource: "manual",
        publication: null,
        author: null,
        publishedDate: null,
      });
    },
    { slug: SLUG, progress: opts.progress, withImages: opts.withImages }
  );
}

/** Scroll like a reader, stop, then watch the viewport for `ms`. */
async function scrollThenWatch(page: Page, ms: number): Promise<Probe> {
  await page.mouse.move(195, 400);
  for (let i = 0; i < 12; i++) {
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(40);
  }
  // Let the scroll physically settle but stay inside the 1s save debounce.
  await page.waitForTimeout(250);

  return page.evaluate(async (ms) => {
    const w = window as any;
    const samples: any[] = [];
    const start = performance.now();
    w.__scrollCalls.length = 0;
    w.__shifts.length = 0;
    while (performance.now() - start < ms) {
      samples.push({
        t: Math.round(performance.now() - start),
        y: window.scrollY,
        docH: document.documentElement.scrollHeight,
        innerH: window.innerHeight,
      });
      await new Promise((r) => setTimeout(r, 50));
    }
    return { samples, scrollCalls: w.__scrollCalls, shifts: w.__shifts };
  }, ms);
}

function report(label: string, probe: Probe) {
  const baseline = probe.samples[0].y;
  const worst = probe.samples.reduce((a, b) =>
    Math.abs(b.y - baseline) > Math.abs(a.y - baseline) ? b : a
  );
  console.log(`\n--- ${label} ---`);
  console.log(`baseline scrollY=${baseline} docH=${probe.samples[0].docH}`);
  let prev = baseline;
  for (const s of probe.samples) {
    if (s.y !== prev) {
      console.log(`  ${s.t}ms  y=${s.y}  (${s.y - baseline >= 0 ? "+" : ""}${s.y - baseline})  docH=${s.docH} innerH=${s.innerH}`);
      prev = s.y;
    }
  }
  for (const c of probe.scrollCalls) {
    console.log(`  ${c.t}ms  PROGRAMMATIC ${c.args}`);
    console.log(`      ${c.stack.split("\n").slice(1, 6).join("\n      ")}`);
  }
  const bigShifts = probe.shifts.filter((s) => s.value > 0.0001);
  if (bigShifts.length) {
    console.log(`  layout shifts: ${bigShifts.map((s) => `${s.t}ms:${s.value.toFixed(4)}`).join(", ")}`);
  }
  console.log(`worst drift: ${worst.y - baseline}px at ${worst.t}ms`);
  return worst.y - baseline;
}

test.describe("Article scroll position stability", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test.setTimeout(120000);

  test.beforeEach(async ({ page }) => {
    await installProbe(page);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test.afterEach(async ({ page }) => {
    await page
      .evaluate(async (slug) => {
        const db = (window as any).savrDb;
        if (db) await db.articles.delete(slug);
      }, SLUG)
      .catch(() => {});
  });

  test("offline, fresh article (progress 0)", async ({ page }) => {
    await seedArticle(page, { progress: 0, withImages: false });
    await page.goto(`/article/${SLUG}`);
    await expect(page.locator('[data-testid="article-content"]')).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(1500);

    const drift = report("offline, progress 0", await scrollThenWatch(page, 5000));
    expect(Math.abs(drift)).toBeLessThanOrEqual(1);
  });

  test("offline, resumed article (progress 45) — restore path active", async ({ page }) => {
    await seedArticle(page, { progress: 45, withImages: false });
    await page.goto(`/article/${SLUG}`);
    await expect(page.locator('[data-testid="article-content"]')).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(1500);

    const drift = report("offline, progress 45", await scrollThenWatch(page, 5000));
    expect(Math.abs(drift)).toBeLessThanOrEqual(1);
  });

  test("sync connected, resumed article — remote progress write in flight", async ({ page }) => {
    const token = getWorkerToken(testEnv.RS_TOKENS, test.info().workerIndex);
    await connectToRemoteStorage(page, getWorkerStorageAddress(test.info().workerIndex), token);
    await waitForRemoteStorageSync(page);

    await seedArticle(page, { progress: 45, withImages: false });
    await page.goto(`/article/${SLUG}`);
    await expect(page.locator('[data-testid="article-content"]')).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(2000);

    const drift = report("connected, progress 45", await scrollThenWatch(page, 8000));
    expect(Math.abs(drift)).toBeLessThanOrEqual(1);
  });

  test("mobile fling + throttled CPU, resumed article", async ({ page, context }) => {
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 6 });

    await seedArticle(page, { progress: 45, withImages: false });
    await page.goto(`/article/${SLUG}`);
    await expect(page.locator('[data-testid="article-content"]')).toBeVisible({ timeout: 25000 });
    await page.waitForTimeout(3000);

    // Real touch fling: synthesizeScrollGesture produces momentum scrolling the
    // way a thumb swipe does, which wheel events never reproduce.
    await cdp.send("Input.synthesizeScrollGesture", {
      x: 195,
      y: 500,
      xDistance: 0,
      yDistance: -1800,
      gestureSourceType: "touch",
      speed: 2000,
    });
    await page.waitForTimeout(400);

    const probe = (await page.evaluate(async () => {
      const w = window as any;
      const samples: any[] = [];
      const start = performance.now();
      w.__scrollCalls.length = 0;
      w.__shifts.length = 0;
      while (performance.now() - start < 10000) {
        samples.push({
          t: Math.round(performance.now() - start),
          y: window.scrollY,
          docH: document.documentElement.scrollHeight,
          innerH: window.innerHeight,
        });
        await new Promise((r) => setTimeout(r, 50));
      }
      return { samples, scrollCalls: w.__scrollCalls, shifts: w.__shifts };
    })) as Probe;

    const drift = report("mobile fling, 6x CPU throttle", probe);
    expect(Math.abs(drift)).toBeLessThanOrEqual(1);
  });

  test("viewport grows mid-read (mobile URL bar collapse)", async ({ page }) => {
    await seedArticle(page, { progress: 45, withImages: false });
    await page.goto(`/article/${SLUG}`);
    await expect(page.locator('[data-testid="article-content"]')).toBeVisible({ timeout: 20000 });
    await page.waitForTimeout(1500);

    await page.mouse.move(195, 400);
    for (let i = 0; i < 12; i++) {
      await page.mouse.wheel(0, 300);
      await page.waitForTimeout(40);
    }
    await page.waitForTimeout(250);

    const before = await page.evaluate(() => window.scrollY);
    // Chrome Android grows the viewport by ~60px when the URL bar collapses.
    await page.setViewportSize({ width: 390, height: 904 });

    const probe = (await page.evaluate(async () => {
      const w = window as any;
      const samples: any[] = [];
      const start = performance.now();
      w.__scrollCalls.length = 0;
      while (performance.now() - start < 6000) {
        samples.push({
          t: Math.round(performance.now() - start),
          y: window.scrollY,
          docH: document.documentElement.scrollHeight,
          innerH: window.innerHeight,
        });
        await new Promise((r) => setTimeout(r, 50));
      }
      return { samples, scrollCalls: w.__scrollCalls, shifts: w.__shifts };
    })) as Probe;

    console.log("scrollY before resize:", before);
    report("viewport resize mid-read", probe);
  });

  /**
   * The "latent position sync" theory, directly: while the reader sits at one
   * position, a *second* device writes a different progress to the same
   * article. The change event lands in Dexie, the liveQuery re-emits, and
   * ArticleScreen re-renders with a progress value that disagrees with where
   * the reader actually is.
   */
  test("second device writes progress while reading", async ({ browser }, testInfo) => {
    const token = getWorkerToken(testEnv.RS_TOKENS, testInfo.workerIndex);
    const address = getWorkerStorageAddress(testInfo.workerIndex);

    const readerCtx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const otherCtx = await browser.newContext();
    const reader = await readerCtx.newPage();
    const other = await otherCtx.newPage();

    try {
      await installProbe(reader);
      await reader.goto("/");
      await reader.waitForLoadState("networkidle");
      await connectToRemoteStorage(reader, address, token);
      await waitForRemoteStorageSync(reader);

      await seedArticle(reader, { progress: 45, withImages: false });
      await reader.goto(`/article/${SLUG}`);
      await expect(reader.locator('[data-testid="article-content"]')).toBeVisible({ timeout: 20000 });
      await reader.waitForTimeout(3000);

      await other.goto("/");
      await other.waitForLoadState("networkidle");
      await connectToRemoteStorage(other, address, token);
      await waitForRemoteStorageSync(other);

      // Reader scrolls and stops.
      await reader.mouse.move(195, 400);
      for (let i = 0; i < 12; i++) {
        await reader.mouse.wheel(0, 300);
        await reader.waitForTimeout(40);
      }
      await reader.waitForTimeout(250);

      // Start watching, then have the other device push a conflicting progress.
      const watching = reader.evaluate(async () => {
        const w = window as any;
        const samples: any[] = [];
        const start = performance.now();
        w.__scrollCalls.length = 0;
        w.__shifts.length = 0;
        while (performance.now() - start < 20000) {
          samples.push({
            t: Math.round(performance.now() - start),
            y: window.scrollY,
            docH: document.documentElement.scrollHeight,
            innerH: window.innerHeight,
          });
          await new Promise((r) => setTimeout(r, 50));
        }
        return { samples, scrollCalls: w.__scrollCalls, shifts: w.__shifts };
      });

      await reader.waitForTimeout(1500);
      await other.evaluate(async (slug) => {
        const db = (window as any).savrDb;
        const client = (window as any).remoteStorageClient;
        // The other device may not have synced this article down yet; build the
        // record from scratch so the test doesn't depend on that race.
        const current = (await db.articles.get(slug)) ?? {
          slug,
          title: "Scroll Stability",
          url: "https://example.com/scroll-stability",
          state: "unread",
          ingestDate: new Date().toISOString(),
          mimeType: "text/html",
          readTimeMinutes: 10,
          ingestPlatform: "web",
          ingestSource: "manual",
          publication: null,
          author: null,
          publishedDate: null,
        };
        const updated = { ...current, progress: 12 };
        await db.articles.put(updated);
        await client.storeFile(
          "application/json",
          `saves/${slug}/article.json`,
          JSON.stringify(updated)
        );
      }, SLUG);
      console.log("other device wrote progress=12");

      const probe = (await watching) as Probe;
      const drift = report("second device wrote progress=12", probe);

      const finalProgress = await reader.evaluate(
        async (slug) => (await (window as any).savrDb.articles.get(slug))?.progress,
        SLUG
      );
      console.log("reader's liveArticle progress at end:", finalProgress);

      expect(Math.abs(drift)).toBeLessThanOrEqual(1);
    } finally {
      await readerCtx.close();
      await otherCtx.close();
    }
  });

  /**
   * Root-cause guard. The reading-progress save fires ~1s after scrolling
   * stops; it re-emits the article through the liveQuery and re-renders
   * ArticleScreen. That re-render must NOT rewrite the article HTML.
   *
   * React 19 diffs dangerouslySetInnerHTML by object identity rather than by
   * the __html string, so passing a fresh `{ __html: sanitize(...) }` literal
   * made every re-render re-assign innerHTML and rebuild the whole article.
   * Text survived that unnoticed, but every <img> was recreated and had to
   * decode again, collapsing the page under the reader.
   */
  test("progress save does not rebuild the article DOM", async ({ page }) => {
    await seedArticle(page, { progress: 0, withImages: false });
    await page.goto(`/article/${SLUG}`);
    await expect(page.locator("[data-testid=\"article-content\"]")).toBeVisible({ timeout: 20000 });
    await page.waitForTimeout(1500);

    await page.evaluate(() => {
      const w = window as any;
      w.__domRebuilds = [];
      new MutationObserver((records) => {
        for (const r of records) {
          if (r.removedNodes.length || r.addedNodes.length) {
            w.__domRebuilds.push({
              removed: r.removedNodes.length,
              added: r.addedNodes.length,
            });
          }
        }
      }).observe(document.querySelector("[data-testid=\"article-content\"]")!, {
        childList: true,
        subtree: true,
      });
    });

    // Scroll, then wait out the 1s save debounce and the write that follows.
    await page.mouse.move(195, 400);
    for (let i = 0; i < 8; i++) {
      await page.mouse.wheel(0, 300);
      await page.waitForTimeout(40);
    }
    await page.waitForTimeout(4000);

    const rebuilds = await page.evaluate(() => (window as any).__domRebuilds);
    console.log("\nchildList mutations during the progress save:", JSON.stringify(rebuilds));

    const progress = await page.evaluate(
      async (slug) => (await (window as any).savrDb.articles.get(slug))?.progress,
      SLUG
    );
    // Guard against a vacuous pass: the save must actually have happened.
    expect(progress, "progress was never saved, so the re-render never happened").toBeGreaterThan(0);
    expect(rebuilds, "the article DOM was rebuilt by a metadata-only re-render").toEqual([]);
  });

  /**
   * The actual reported bug: an article with images bounces a second or two
   * after the reader stops scrolling.
   *
   * Saved articles inline their images with no width/height attributes, and
   * web.css sets `img { height: auto }` — so every image is a zero-height box
   * until it decodes. When one above the viewport finally decodes it expands
   * and shoves the text down. The browser would normally absorb that with
   * scroll anchoring, but ArticleScreen's wrapper uses `overflowX: hidden`,
   * which makes it a scroll container that never scrolls — and that steals
   * scroll anchoring from the document scroller.
   *
   * The assertion is on where the *text* sits on screen, not on window.scrollY:
   * working scroll anchoring is free to change scrollY, as long as the reader's
   * line of text stays put.
   */
  test("text does not move when a late image loads above the viewport", async ({ page }) => {
    // A real 600x400 PNG that only arrives well after the reader has stopped.
    const PNG = makePng(600, 400);
    await page.route("**/savr-late-image/**", async (route) => {
      await new Promise((r) => setTimeout(r, 6000));
      await route.fulfill({ status: 200, contentType: "image/png", body: PNG });
    });

    await page.waitForFunction(
      () => !!(window as any).savrDb && !!(window as any).remoteStorageClient,
      { timeout: 20000 }
    );
    await page.evaluate(async (slug) => {
      const db = (window as any).savrDb;
      const client = (window as any).remoteStorageClient;

      // Images every few paragraphs, with no width/height — exactly the shape
      // ingestion produces today.
      const body = Array.from({ length: 80 }, (_, i) => {
        const para = `<p id="p${i}">Paragraph ${i}. ${"The quick brown fox jumps over the lazy dog. ".repeat(10)}</p>`;
        return i % 4 === 2
          ? `${para}\n<img src="https://savr-late-image.invalid/savr-late-image/${i}.png" alt="figure ${i}">`
          : para;
      }).join("\n");

      await client.storeFile(
        "text/html",
        `saves/${slug}/index.html`,
        `<link rel="stylesheet" href="/web.css"><h1>Images</h1>${body}`
      );
      await db.articles.put({
        slug,
        title: "Images",
        url: "https://example.com/images",
        state: "unread",
        ingestDate: new Date().toISOString(),
        mimeType: "text/html",
        readTimeMinutes: 10,
        progress: 0,
        ingestPlatform: "web",
        ingestSource: "manual",
        publication: null,
        author: null,
        publishedDate: null,
      });
    }, SLUG);

    await page.goto(`/article/${SLUG}`);
    await expect(page.locator('[data-testid="article-content"]')).toBeVisible({ timeout: 20000 });
    await page.waitForTimeout(1000);

    // Read down the page, past several not-yet-loaded images, then stop.
    await page.mouse.move(195, 400);
    for (let i = 0; i < 10; i++) {
      await page.mouse.wheel(0, 250);
      await page.waitForTimeout(40);
    }
    await page.waitForTimeout(500);

    // Watch the line of text the reader is actually looking at.
    const result = await page.evaluate(async () => {
      const paras = Array.from(document.querySelectorAll("p[id^='p']")) as HTMLElement[];
      const marker = paras.find((p) => {
        const r = p.getBoundingClientRect();
        return r.top > 100 && r.top < 500;
      });
      if (!marker) return null;

      const startTop = marker.getBoundingClientRect().top;
      const startY = window.scrollY;
      let worstTop = startTop;
      const timeline: string[] = [];
      const t0 = performance.now();
      const mutations: string[] = [];
      new MutationObserver((records) => {
        for (const r of records) {
          if (r.removedNodes.length || r.addedNodes.length) {
            const target = r.target as HTMLElement;
            mutations.push(
              `${Math.round(performance.now() - t0)}ms childList on <${target.tagName?.toLowerCase()}` +
                `${target.id ? "#" + target.id : ""}${target.dataset?.testid ? "[" + target.dataset.testid + "]" : ""}>` +
                ` -${r.removedNodes.length} +${r.addedNodes.length}`
            );
          }
        }
      }).observe(document.querySelector('[data-testid="article-content"]')!, {
        childList: true,
        subtree: true,
      });
      let prev = "";
      const start = performance.now();
      while (performance.now() - start < 9000) {
        const top = marker.getBoundingClientRect().top;
        if (Math.abs(top - startTop) > Math.abs(worstTop - startTop)) worstTop = top;
        const imgs = Array.from(document.querySelectorAll("img")) as HTMLImageElement[];
        const loaded = imgs.filter((i) => i.naturalHeight > 0).length;
        const line = `top=${Math.round(top)} y=${Math.round(window.scrollY)} docH=${document.documentElement.scrollHeight} imgsLoaded=${loaded}/${imgs.length}`;
        if (line !== prev) {
          timeline.push(`${Math.round(performance.now() - start)}ms ${line}`);
          prev = line;
        }
        await new Promise((r) => setTimeout(r, 50));
      }
      return {
        markerId: marker.id,
        startTop,
        worstTop,
        shift: Math.round(worstTop - startTop),
        startY,
        endY: window.scrollY,
        scrollYDelta: window.scrollY - startY,
        timeline,
        mutations: mutations.slice(0, 20),
        markerStillAttached: marker.isConnected,
      };
    });

    expect(result).not.toBeNull();
    console.log("\n--- late image load ---");
    console.log(`  watching <p#${result!.markerId}>`);
    console.log(`  text moved on screen: ${result!.shift}px`);
    console.log(`  window.scrollY moved: ${result!.scrollYDelta}px (anchoring compensation)`);
    for (const line of (result as any).timeline) console.log("   ", line);
    console.log("  marker still attached:", (result as any).markerStillAttached);
    for (const line of (result as any).mutations) console.log("    MUT", line);

    // The reader's text must stay put. scrollY moving is fine — that is the
    // browser absorbing the shift on our behalf.
    expect(
      Math.abs(result!.shift),
      `article text jumped ${result!.shift}px when a late image loaded`
    ).toBeLessThanOrEqual(4);
  });

  /**
   * Articles saved before failed images were swapped for local placeholders
   * (#79) still hold the original remote URL for any image whose download
   * failed, so those images are fetched over the network on every read.
   *
   * Combined with the innerHTML rebuild that is the bug above, each progress
   * save replaced those <img> elements and restarted their downloads from
   * zero — so on a slow connection the images could never finish, because
   * every reading pause cancelled them. This pins one request per image.
   */
  test("progress save does not restart in-flight image downloads", async ({ page }) => {
    const PNG = makePng(600, 400);
    let requests = 0;
    await page.route("**/savr-slow-image/**", async (route) => {
      requests++;
      await new Promise((r) => setTimeout(r, 5000));
      await route.fulfill({
        status: 200,
        contentType: "image/png",
        body: PNG,
        headers: { "cache-control": "no-store" },
      });
    });

    await page.waitForFunction(
      () => !!(window as any).savrDb && !!(window as any).remoteStorageClient,
      { timeout: 20000 }
    );
    await page.evaluate(async (slug) => {
      const db = (window as any).savrDb;
      const client = (window as any).remoteStorageClient;
      const body = Array.from({ length: 40 }, (_, i) => {
        const para = `<p>Paragraph ${i}. ${"The quick brown fox jumps over the lazy dog. ".repeat(10)}</p>`;
        // Four images that stayed remote because their ingest download failed.
        return i % 10 === 5
          ? `${para}\n<img src="https://savr-slow-image.invalid/savr-slow-image/${i}.png" alt="figure ${i}">`
          : para;
      }).join("\n");

      await client.storeFile(
        "text/html",
        `saves/${slug}/index.html`,
        `<link rel="stylesheet" href="/web.css"><h1>Slow images</h1>${body}`
      );
      await db.articles.put({
        slug,
        title: "Slow images",
        url: "https://example.com/slow-images",
        state: "unread",
        ingestDate: new Date().toISOString(),
        mimeType: "text/html",
        readTimeMinutes: 5,
        progress: 0,
        ingestPlatform: "web",
        ingestSource: "manual",
        publication: null,
        author: null,
        publishedDate: null,
      });
    }, SLUG);

    await page.goto(`/article/${SLUG}`);
    await expect(page.locator('[data-testid="article-content"]')).toBeVisible({ timeout: 20000 });
    await page.waitForTimeout(1000);

    const imageCount = await page.evaluate(() => document.querySelectorAll("img").length);
    const afterLoad = requests;

    // Three separate reading pauses, each triggering a progress save.
    for (let pause = 0; pause < 3; pause++) {
      await page.mouse.move(195, 400);
      for (let i = 0; i < 5; i++) {
        await page.mouse.wheel(0, 200);
        await page.waitForTimeout(40);
      }
      await page.waitForTimeout(1600);
    }

    console.log(`\n  images in article: ${imageCount}`);
    console.log(`  image requests after initial load: ${afterLoad}`);
    console.log(`  image requests after 3 reading pauses: ${requests}`);

    const progress = await page.evaluate(
      async (slug) => (await (window as any).savrDb.articles.get(slug))?.progress,
      SLUG
    );
    expect(progress, "progress was never saved, so no re-render happened").toBeGreaterThan(0);
    expect(
      requests,
      `each image was re-requested: ${requests} requests for ${imageCount} images`
    ).toBe(imageCount);
  });

  /**
   * Same rebuild, worse consequence once inline video embeds are rendered:
   * re-assigning innerHTML recreates every <iframe>, which reloads the whole
   * player (several MB) on each reading pause — and would stop a playing
   * video. Pins one load per embed across several progress saves.
   */
  test("progress save does not reload video embeds", async ({ page }) => {
    let loads = 0;
    await page.route("**/www.youtube.com/embed/**", async (route) => {
      loads++;
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<!doctype html><title>player</title><p>stub player</p>",
      });
    });

    await page.waitForFunction(
      () => !!(window as any).savrDb && !!(window as any).remoteStorageClient,
      { timeout: 20000 }
    );
    await page.evaluate(async (slug) => {
      const db = (window as any).savrDb;
      const client = (window as any).remoteStorageClient;
      const body = Array.from({ length: 40 }, (_, i) => {
        const para = `<p>Paragraph ${i}. ${"The quick brown fox jumps over the lazy dog. ".repeat(10)}</p>`;
        return i % 15 === 3
          ? `${para}\n<iframe src="https://www.youtube.com/embed/vid${i}" width="560" height="315" allowfullscreen></iframe>`
          : para;
      }).join("\n");

      await client.storeFile(
        "text/html",
        `saves/${slug}/index.html`,
        `<link rel="stylesheet" href="/web.css"><h1>Embeds</h1>${body}`
      );
      await db.articles.put({
        slug,
        title: "Embeds",
        url: "https://example.com/embeds",
        state: "unread",
        ingestDate: new Date().toISOString(),
        mimeType: "text/html",
        readTimeMinutes: 5,
        progress: 0,
        ingestPlatform: "web",
        ingestSource: "manual",
        publication: null,
        author: null,
        publishedDate: null,
      });
    }, SLUG);

    await page.goto(`/article/${SLUG}`);
    await expect(page.locator('[data-testid="article-content"]')).toBeVisible({ timeout: 20000 });
    await page.waitForTimeout(1500);

    const embedCount = await page.evaluate(() => document.querySelectorAll("iframe").length);
    // Guard against a vacuous pass: the sanitiser must have kept the embeds.
    expect(embedCount, "the sanitiser dropped the video embeds").toBeGreaterThan(0);

    // Three separate reading pauses, each triggering a progress save.
    for (let pause = 0; pause < 3; pause++) {
      await page.mouse.move(195, 400);
      for (let i = 0; i < 5; i++) {
        await page.mouse.wheel(0, 200);
        await page.waitForTimeout(40);
      }
      await page.waitForTimeout(1600);
    }

    console.log(`\n  embeds in article: ${embedCount}`);
    console.log(`  player loads after 3 reading pauses: ${loads}`);

    const progress = await page.evaluate(
      async (slug) => (await (window as any).savrDb.articles.get(slug))?.progress,
      SLUG
    );
    expect(progress, "progress was never saved, so no re-render happened").toBeGreaterThan(0);
    expect(loads, `embeds were reloaded: ${loads} loads for ${embedCount} embeds`).toBe(embedCount);
  });
});
