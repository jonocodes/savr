import { test, expect, Page, CDPSession } from "@playwright/test";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Profiling harness (opt-in: SAVR_PROFILE=1) for the re-render a reading-
 * progress save causes.
 *
 * ArticleScreen subscribes to the whole article row via useLiveQuery, so every
 * progress write re-emits the row and re-renders the whole screen even though
 * nothing on screen depends on `progress`. This measures what that costs.
 *
 * Method: identical progress writes to two rows.
 *   - treatment: the OPEN article's row -> liveQuery re-emits -> re-render
 *   - control:   a DIFFERENT article's row -> same IndexedDB cost, no re-render
 * The difference is the re-render's cost.
 *
 * Run it with `npm run profile:rerender`, which builds and serves a production
 * React build first. Against the dev server the numbers come out 5-7x worse,
 * because dev React is much slower — that would overstate the cost.
 */

const SLUG = "profile-rerender-article";
const OTHER = "profile-rerender-other";
const WRITES = 40;
const GAP_MS = 120;

test.skip(!process.env.SAVR_PROFILE, "profiling harness; run with SAVR_PROFILE=1");

/**
 * A minimal React DevTools hook stub, installed before React loads. React
 * calls onCommitFiberRoot after every commit (in production builds too), which
 * lets us count commits — and, when walking is enabled, count the components
 * that actually re-rendered in each commit.
 */
async function installCommitCounter(page: Page) {
  await page.addInitScript(() => {
    const w = window as any;
    w.__commits = 0;
    w.__walk = false;
    w.__rendered = [];
    let prevFibers = new Set<any>();

    const isComponent = (f: any) =>
      typeof f.type === "function" || (f.type && typeof f.type === "object" && f.tag !== 5);

    w.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      supportsFiber: true,
      renderers: new Map(),
      inject() {
        return 1;
      },
      checkDCE() {},
      onScheduleFiberRoot() {},
      onCommitFiberUnmount() {},
      onPostCommitFiberRoot() {},
      onCommitFiberRoot(_id: number, root: any) {
        w.__commits++;
        if (!w.__walk) return;
        // A fiber re-rendered in this commit iff it has PerformedWork (flag 1)
        // and is not the very same object as in the previous committed tree:
        // untouched subtrees are reused as-is, while re-processed fibers are
        // their double-buffered alternate — a different object.
        const seen = new Set<any>();
        const names: string[] = [];
        const stack = [root.current];
        while (stack.length) {
          const f = stack.pop();
          if (!f) continue;
          seen.add(f);
          if (isComponent(f) && f.flags & 1 && !prevFibers.has(f)) {
            const t = f.type;
            names.push(t?.displayName || t?.name || t?.render?.name || t?.type?.name || "anonymous");
          }
          if (f.sibling) stack.push(f.sibling);
          if (f.child) stack.push(f.child);
        }
        prevFibers = seen;
        w.__rendered.push(names);
      },
    };
  });
}

async function seed(page: Page) {
  await page.waitForFunction(
    () => !!(window as any).savrDb && !!(window as any).remoteStorageClient,
    { timeout: 30000 }
  );
  await page.evaluate(
    async ({ slug, other }) => {
      const db = (window as any).savrDb;
      const client = (window as any).remoteStorageClient;
      // A long-read-sized article: ~6000 words with section headings.
      const body = Array.from({ length: 150 }, (_, i) =>
        (i % 15 === 0 ? `<h2>Section ${i / 15}</h2>` : "") +
        `<p>Paragraph ${i}. ${"The quick brown fox jumps over the lazy dog. ".repeat(4)}</p>`
      ).join("\n");
      await client.storeFile(
        "text/html",
        `saves/${slug}/index.html`,
        `<link rel="stylesheet" href="/web.css"><h1>Profile</h1>${body}`
      );
      const base = {
        state: "unread",
        ingestDate: new Date().toISOString(),
        mimeType: "text/html",
        readTimeMinutes: 25,
        progress: 0,
        ingestPlatform: "web",
        ingestSource: "manual",
        publication: null,
        author: null,
        publishedDate: null,
      };
      await db.articles.put({ ...base, slug, title: "Profile", url: "https://example.com/p" });
      await db.articles.put({ ...base, slug: other, title: "Other", url: "https://example.com/o" });
    },
    { slug: SLUG, other: OTHER }
  );
}

async function metrics(cdp: CDPSession) {
  const { metrics } = await cdp.send("Performance.getMetrics");
  const m = Object.fromEntries(metrics.map((x: any) => [x.name, x.value]));
  return {
    task: m.TaskDuration * 1000,
    script: m.ScriptDuration * 1000,
    layout: m.LayoutDuration * 1000,
    style: m.RecalcStyleDuration * 1000,
  };
}

/** Write `progress` to `slug` WRITES times, GAP_MS apart; return per-write costs. */
async function burst(page: Page, cdp: CDPSession, slug: string, start: number) {
  const commits0 = await page.evaluate(() => (window as any).__commits);
  const before = await metrics(cdp);
  await page.evaluate(
    async ({ slug, start, writes, gap }) => {
      const db = (window as any).savrDb;
      for (let i = 0; i < writes; i++) {
        await db.articles.update(slug, { progress: start + i });
        await new Promise((r) => setTimeout(r, gap));
      }
    },
    { slug, start, writes: WRITES, gap: GAP_MS }
  );
  const after = await metrics(cdp);
  const commits = (await page.evaluate(() => (window as any).__commits)) - commits0;
  const per = (k: keyof typeof before) => (after[k] - before[k]) / WRITES;
  return {
    task: per("task"),
    script: per("script"),
    layout: per("layout"),
    style: per("style"),
    commitsPerWrite: commits / WRITES,
  };
}

const fmt = (n: number) => n.toFixed(2).padStart(7);

for (const throttle of [1, 4, 6]) {
  test(`cost of a progress-save re-render @ ${throttle}x CPU`, async ({ page, context }) => {
    test.setTimeout(180000);
    await installCommitCounter(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await seed(page);

    await page.goto(`/article/${SLUG}`);
    await expect(page.locator('[data-testid="article-content"]')).toBeVisible({ timeout: 30000 });
    await page.waitForTimeout(2000);

    const cdp = await context.newCDPSession(page);
    await cdp.send("Performance.enable");
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle });

    // Long tasks (>50ms) during the treatment burst — a visible hitch.
    await page.evaluate(() => {
      const w = window as any;
      w.__longTasks = [];
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) w.__longTasks.push(Math.round(e.duration));
      }).observe({ type: "longtask" });
    });

    // Warm up both paths (JIT, Dexie caches), then measure. Interleave
    // control/treatment twice so drift doesn't favour either side.
    await burst(page, cdp, OTHER, 1000);
    await burst(page, cdp, SLUG, 1000);
    await page.evaluate(() => ((window as any).__longTasks = []));

    const c1 = await burst(page, cdp, OTHER, 2000);
    const t1 = await burst(page, cdp, SLUG, 2000);
    const c2 = await burst(page, cdp, OTHER, 3000);
    const t2 = await burst(page, cdp, SLUG, 3000);
    const avg = (a: any, b: any) =>
      Object.fromEntries(Object.keys(a).map((k) => [k, (a[k] + b[k]) / 2])) as typeof a;
    const control = avg(c1, c2);
    const treatment = avg(t1, t2);
    const longTasks = await page.evaluate(() => (window as any).__longTasks);

    // One extra write with the tree walk on, to see WHAT re-rendered.
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    const rendered = await page.evaluate(async (slug) => {
      const w = window as any;
      w.__walk = true;
      // Prime prevFibers with a no-op commit baseline.
      await w.savrDb.articles.update(slug, { progress: 4000 });
      await new Promise((r) => setTimeout(r, 300));
      w.__rendered = [];
      await w.savrDb.articles.update(slug, { progress: 4001 });
      await new Promise((r) => setTimeout(r, 300));
      w.__walk = false;
      return w.__rendered;
    }, SLUG);
    const names: string[] = rendered.flat();
    const counts = names.reduce<Record<string, number>>((acc, n) => {
      acc[n] = (acc[n] ?? 0) + 1;
      return acc;
    }, {});

    console.log(`\n=== progress-save re-render cost @ ${throttle}x CPU (per write, ms) ===`);
    console.log(`              task   script   layout    style  commits`);
    for (const [label, r] of [
      ["control", control],
      ["treatment", treatment],
    ] as const) {
      console.log(
        `  ${label.padEnd(9)} ${fmt(r.task)}  ${fmt(r.script)}  ${fmt(r.layout)}  ${fmt(r.style)}  ${r.commitsPerWrite.toFixed(2)}`
      );
    }
    console.log(
      `  RE-RENDER ${fmt(treatment.task - control.task)}  ${fmt(treatment.script - control.script)}  ` +
        `${fmt(treatment.layout - control.layout)}  ${fmt(treatment.style - control.style)}`
    );
    console.log(`  long tasks (>50ms) during measured bursts: ${JSON.stringify(longTasks)}`);
    console.log(`  components re-rendered by one save: ${names.length}`);
    console.log(
      `  ${Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 25)
        .map(([n, c]) => `${n}×${c}`)
        .join(", ")}`
    );

    // Sanity: the control must not re-render, or the subtraction is meaningless.
    expect(control.commitsPerWrite).toBeLessThan(0.1);
    expect(treatment.commitsPerWrite).toBeGreaterThan(0.9);
  });
}
