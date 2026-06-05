/**
 * Standalone Playwright script for observing live sync on the dev server at http://localhost:3000.
 * Does NOT use the test global-setup — assumes the dev server is already running.
 *
 * Usage:
 *   flox activate -- npx tsx scripts/watch-sync.ts
 *
 * Options (env vars):
 *   WATCH_URL=http://localhost:3000   target app URL (default: http://localhost:3000)
 *   WATCH_DURATION=60                 seconds to observe after RS connects (default: 60)
 *   WATCH_FILTER=wire-busy            comma-separated categories to print (default: all)
 */

import { chromium, type Page } from "playwright";
import fs from "fs";
import path from "path";
import os from "os";

const BASE_URL = process.env.WATCH_URL ?? "http://localhost:3000";
const DURATION_S = Number(process.env.WATCH_DURATION ?? "60");
const FILTER = process.env.WATCH_FILTER
  ? new Set(process.env.WATCH_FILTER.split(",").map((s) => s.trim()))
  : null;
const OUT_FILE = "/tmp/savr-diag.jsonl";

interface DiagEvent {
  category: string;
  data?: Record<string, unknown>;
  ts: number;
}

declare global {
  interface Window {
    __savrDiag?: DiagEvent[];
  }
}

async function safeEval(page: Page, fn: () => DiagEvent[]): Promise<DiagEvent[] | null> {
  try {
    return await page.evaluate(fn);
  } catch {
    return null;
  }
}

async function waitForConnected(page: Page): Promise<boolean> {
  // After OAuth, the page lands on localhost with #access_token in the hash.
  // Reload /diagnostics so the updated storage.ts runs fresh with __savrDiag wired up,
  // then wait for any diagnostic event (progress/db-put/change) as the signal RS is active.
  console.log("Waiting for OAuth to complete — watching for localhost return ...");
  const deadline = Date.now() + 180_000;

  // Wait until we're back on localhost (survives OAuth redirect)
  while (Date.now() < deadline) {
    const url = page.url();
    if (url.includes("localhost")) break;
    await new Promise((r) => setTimeout(r, 500));
  }

  // Reload to /diagnostics so the latest storage.ts (with __savrDiag) is active
  console.log("Reloading /diagnostics to pick up latest storage.ts ...");
  await page.goto(`${BASE_URL}/diagnostics`, { waitUntil: "domcontentloaded" });

  // Now wait for any diagnostic event — "progress" fires first on connect
  console.log("Waiting for sync activity (up to 2min) ...");
  while (Date.now() < deadline) {
    const events = await safeEval(page, () => window.__savrDiag ?? []);
    if (events && events.length > 0) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function main() {
  const userDataDir = path.join(os.homedir(), ".savr-watch-profile");
  const context = await chromium.launchPersistentContext(userDataDir, { headless: false });
  const page = context.pages()[0] ?? await context.newPage();

  page.on("console", (msg) => {
    if (msg.type() === "error") console.error("[browser]", msg.text());
  });

  console.log(`Navigating to ${BASE_URL}/diagnostics ...`);
  await page.goto(`${BASE_URL}/diagnostics`, { waitUntil: "domcontentloaded" });

  const connected = await waitForConnected(page);
  if (connected) {
    console.log("✅ RemoteStorage connected\n");
  } else {
    console.warn("⚠️  RS did not connect — proceeding anyway\n");
  }

  // Reset output file and index *after* connection so we capture the sync burst
  fs.writeFileSync(OUT_FILE, "");
  console.log(`Writing events to ${OUT_FILE}`);

  let lastIndex = 0;
  const summary: Record<string, number> = {};
  const startTs = Date.now();

  console.log(`Observing for ${DURATION_S}s  (filter: ${FILTER ? [...FILTER].join(",") : "all"})`);
  console.log("─".repeat(80));

  const poll = async () => {
    const events = await safeEval(page, () => window.__savrDiag ?? []);
    if (!events) return; // context destroyed mid-navigate — skip this tick

    const newEvents = events.slice(lastIndex);
    lastIndex = events.length;

    for (const e of newEvents) {
      summary[e.category] = (summary[e.category] ?? 0) + 1;
      fs.appendFileSync(OUT_FILE, JSON.stringify(e) + "\n");
      if (FILTER && !FILTER.has(e.category)) continue;
      const t = new Date(e.ts).toISOString().slice(11, 23); // HH:MM:SS.mmm
      const dataStr = e.data ? JSON.stringify(e.data) : "";
      console.log(`${t}  ${e.category.padEnd(14)}  ${dataStr}`);
    }
  };

  const interval = setInterval(poll, 500);
  await new Promise((resolve) => setTimeout(resolve, DURATION_S * 1000));
  clearInterval(interval);
  await poll(); // flush remaining

  console.log("\n" + "─".repeat(80));
  console.log("Event summary:");
  for (const [cat, count] of Object.entries(summary).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cat.padEnd(20)} ${count}`);
  }

  // Report on the decisive question from SYNC_REDESIGN_DISCUSSION §6:
  // Are wire-busy events for resource files (re-downloads) or just directory listings?
  const wireBusyEvents = await safeEval(page, () =>
    (window.__savrDiag ?? []).filter((e) => e.category === "wire-busy")
  );
  if (wireBusyEvents && wireBusyEvents.length > 0) {
    const paths = wireBusyEvents.map((e) => String(e.data?.path ?? ""));
    const resourcePaths = paths.filter((p) => p.includes("/resources/") || p.endsWith("raw.html"));
    const listingPaths = paths.filter((p) => p.endsWith("/"));
    const articleJsonPaths = paths.filter((p) => p.endsWith("article.json"));
    const other = paths.length - listingPaths.length - articleJsonPaths.length - resourcePaths.length;
    console.log("\nwire-busy breakdown:");
    console.log(`  directory listings : ${listingPaths.length}`);
    console.log(`  article.json       : ${articleJsonPaths.length}`);
    console.log(`  resource/raw files : ${resourcePaths.length}  ← key question`);
    console.log(`  other              : ${other}`);
  }

  console.log(`\nTotal elapsed: ${((Date.now() - startTs) / 1000).toFixed(1)}s`);
  await context.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
