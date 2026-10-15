/**
 * The stats worker's HTML: an unlock page and the usage dashboard.
 *
 * Deliberately no build step and no external assets (no CDN), and no `innerHTML`
 * for data — hostnames and country codes flow through textContent, so a hostile
 * upstream hostname can never become markup. `renderDashboard` is parameterised
 * by worker.js so the filter vocabularies have a single source of truth.
 */

const SHARED_CSS = `
  :root {
    color-scheme: light dark;
    --bg: #ffffff; --fg: #17202a; --muted: #66717d;
    --card: #f6f7f9; --line: #e4e8ec; --accent: #2f6fed; --bad: #c0392b;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0f1419; --fg: #e7eaef; --muted: #98a2ae;
      --card: #171e26; --line: #27303b; --accent: #5b8df7; --bad: #ff7b72;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--fg);
    font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  main { max-width: 980px; margin: 0 auto; padding: 24px 16px 64px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  h2 { font-size: 13px; margin: 0 0 10px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); }
  .note { color: var(--muted); font-size: 13px; margin: 4px 0 0; }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; }
  a { color: var(--accent); }
`;

function shell(title, body) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${title}</title>
<style>${SHARED_CSS}</style>
</head>
<body>
<main>
${body}
</main>
</body>
</html>`;
}

export function renderUnlock(message = "") {
  return shell(
    "Savr CORS proxy — sign in",
    `<h1>CORS proxy usage</h1>
<p class="note">This dashboard is private. Enter the access key to continue.</p>
<form method="post" action="/" class="card" style="margin-top:16px;max-width:360px;display:flex;gap:8px;flex-wrap:wrap">
  <input type="password" name="key" placeholder="Access key" autocomplete="current-password" required
    style="flex:1 1 180px;padding:9px 10px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--fg)">
  <button type="submit" style="padding:9px 14px;border:0;border-radius:8px;background:var(--accent);color:#fff;cursor:pointer">Unlock</button>
  <p class="note" style="flex-basis:100%;margin:0;color:var(--bad)">${message}</p>
</form>`
  );
}

// Human labels for the shared stats vocabularies (infra/cors-worker/
// stats-schema.js); the tests check every vocabulary value has one.
export const MIME_LABELS = {
  all: "All types", html: "HTML (articles)", image: "Images", video: "Video",
  audio: "Audio", font: "Fonts", css: "CSS", js: "JavaScript", pdf: "PDF",
  json: "JSON", xml: "XML", text: "Text", other: "Other", none: "Unknown",
};
export const CACHE_LABELS = {
  all: "All", hit: "Edge-cache hits", miss: "Origin fetches (misses)",
  bypass: "Not cached (HEAD / invalid)",
};
export const CLIENT_LABELS = {
  browser: "Browser (Savr app / PWA)", bot: "Bot / script / CLI", other: "Other",
  none: "No user agent",
};
export const ERROR_LABELS = {
  dns: "DNS lookup failed", timeout: "Timed out",
  "blocked-redirect": "Redirect to a blocked host", "redirect-loop": "Too many redirects",
  other: "Other network error",
};

export function renderDashboard({ ranges, mimes, caches } = {}) {
  return shell(
    "Savr CORS proxy — usage",
    `<h1>CORS proxy usage</h1>
<p class="note">Aggregate counts only — no URLs, no IPs. Countries are derived by
Cloudflare from the caller IP and are approximate (VPNs, Tor = T1). Analytics
Engine samples busy periods, so numbers are estimates. Public worker: totals
include any non-Savr callers. Retained 90 days.</p>

<div id="controls" style="display:flex;gap:12px;flex-wrap:wrap;align-items:end;margin:18px 0">
  <div id="ranges" role="group" aria-label="Range" style="display:flex;gap:6px"></div>
  <label class="note">Type
    <select id="mime" style="display:block;margin-top:2px;padding:6px 8px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--fg)"></select>
  </label>
  <label class="note">Cache
    <select id="cache" style="display:block;margin-top:2px;padding:6px 8px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--fg)"></select>
  </label>
  <button id="refresh" type="button" style="padding:7px 12px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--fg);cursor:pointer">Refresh</button>
  <p id="status" class="note" style="flex-basis:100%;margin:0"></p>
</div>

<div id="tiles" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px"></div>

<section class="card" style="margin-top:14px">
  <h2>Requests over time</h2>
  <div id="chart" style="height:120px"></div>
  <div id="chartAxis" class="note" style="display:flex;justify-content:space-between"></div>
</section>

<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px;margin-top:14px">
  <section class="card"><h2>Countries</h2><div id="countries"></div></section>
  <section class="card"><h2>Callers (app origin)</h2><div id="origins"></div></section>
  <section class="card"><h2>Clients</h2><div id="clients"></div></section>
  <section class="card"><h2>Types</h2><div id="mimes"></div></section>
  <section class="card"><h2>Cache</h2><div id="caches"></div></section>
  <section class="card"><h2>Statuses</h2><div id="statuses"></div></section>
  <section class="card"><h2>Fetch failures (502)</h2><div id="errors"></div></section>
</div>

<section class="card" style="margin-top:14px">
  <h2>Failing hosts (from error responses)</h2>
  <div id="hosts"></div>
</section>

<script>
(() => {
  var CFG = ${JSON.stringify({ ranges: ranges || [], mimes: mimes || [], caches: caches || [] })};
  var MIME_LABELS = ${JSON.stringify(MIME_LABELS)};
  var CACHE_LABELS = ${JSON.stringify(CACHE_LABELS)};
  var CLIENT_LABELS = ${JSON.stringify(CLIENT_LABELS)};
  var ERROR_LABELS = ${JSON.stringify(ERROR_LABELS)};
  var state = { range: "7d", mime: "all", cache: "all" };
  try {
    var params = new URLSearchParams(location.search);
    if (CFG.ranges.indexOf(params.get("range")) >= 0) state.range = params.get("range");
    if (CFG.mimes.indexOf(params.get("mime")) >= 0) state.mime = params.get("mime");
    if (CFG.caches.indexOf(params.get("cache")) >= 0) state.cache = params.get("cache");
  } catch (error) { /* keep defaults */ }

  var $ = (id) => document.getElementById(id);
  var status = $("status");
  var fmt = new Intl.NumberFormat();
  var regionName;
  try { regionName = new Intl.DisplayNames(["en"], { type: "region" }); } catch (error) { regionName = null; }

  function countryLabel(code) {
    if (!code || code === "XX") return "Unknown";
    if (code === "T1") return "Tor";
    try { return regionName ? regionName.of(code) : code; } catch (error) { return code; }
  }

  function originLabel(origin) {
    if (!origin) return "No origin header";
    if (origin === "savr.link") return "savr.link (hosted app)";
    if (origin === "local") return "Local / LAN (dev)";
    if (origin === "chrome-extension") return "Extension (Chrome)";
    if (origin === "moz-extension") return "Extension (Firefox)";
    if (origin === "safari-web-extension") return "Extension (Safari)";
    return origin;
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function total(rows) {
    return rows.reduce((sum, row) => sum + Number(row.n || 0), 0);
  }

  function sizeLabel(bytes) {
    if (!bytes) return "–";
    var units = ["B", "KB", "MB", "GB", "TB"];
    var i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    return (bytes / Math.pow(1024, i)).toFixed(i ? 1 : 0) + " " + units[i];
  }

  function renderTiles(data) {
    var requests = total(data.statuses || []);
    var errors = (data.statuses || []).reduce((sum, row) => Number(row.status) >= 400 ? sum + Number(row.n) : sum, 0);
    var hits = 0, misses = 0;
    (data.caches || []).forEach((row) => {
      if (row.cache === "hit") hits += Number(row.n);
      if (row.cache === "miss") misses += Number(row.n);
    });
    var tiles = [
      ["Articles", data.articles, "HTML pages fetched from origin (edge misses)"],
      ["Requests", requests, "all proxied requests in range (incl. this filter)"],
      ["Errors", errors, "responses with status >= 400"],
      ["Error rate", requests ? (100 * errors / requests).toFixed(2) + "%" : "–", ""],
      ["Edge-cache hit rate", hits + misses ? (100 * hits / (hits + misses)).toFixed(1) + "%" : "–", ""],
      ["Avg origin fetch", data.originMs ? Math.round(data.originMs) + " ms" : "–", "mean time to answer an edge-cache miss"],
      ["Data served", sizeLabel(data.bytes), "advertised bytes; chunked responses are not counted"],
    ];
    var root = $("tiles");
    root.textContent = "";
    tiles.forEach(([label, value, hint]) => {
      var card = el("div", "card");
      card.style.padding = "12px 14px";
      var big = el("div", null, typeof value === "number" ? fmt.format(value) : String(value));
      big.style.cssText = "font-size:24px;font-weight:650;line-height:1.2";
      var caption = el("div", "note", label);
      card.append(big, caption);
      if (hint) card.title = hint;
      root.append(card);
    });
  }

  function renderChart(data) {
    var root = $("chart");
    root.textContent = "";
    var rows = data.series || [];
    var max = Math.max(1, ...rows.map((row) => Number(row.n)));
    var bars = el("div");
    bars.style.cssText = "display:flex;align-items:flex-end;gap:2px;height:100%";
    rows.forEach((row) => {
      var bar = el("div");
      var pct = Math.max(2, Math.round(100 * Number(row.n) / max));
      bar.style.cssText = "flex:1;min-width:2px;height:" + pct + "%;background:var(--accent);border-radius:2px 2px 0 0";
      bar.title = when(row.t) + " — " + fmt.format(Number(row.n)) + " requests";
      bars.append(bar);
    });
    if (!rows.length) root.append(el("p", "note", "No data yet."));
    else root.append(bars);
    $("chartAxis").textContent = "";
    if (rows.length) {
      $("chartAxis").append(el("span", null, when(rows[0].t)), el("span", null, when(rows[rows.length - 1].t)));
    }
  }

  function when(t) {
    var date = new Date(Number(t) * 1000);
    if (state.range === "24h" || state.range === "7d") {
      return date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    }
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  }

  function renderList(id, rows, options) {
    var root = $(id);
    root.textContent = "";
    if (!rows.length) { root.append(el("p", "note", "No data.")); return; }
    var max = Math.max(1, ...rows.map((row) => Number(row.n)));
    rows.forEach((row) => {
      var line = el("div");
      line.style.cssText = "position:relative;display:flex;justify-content:space-between;gap:10px;padding:3px 6px;border-radius:5px;overflow:hidden";
      var fill = el("div");
      var pct = Math.round(100 * Number(row.n) / max);
      fill.style.cssText = "position:absolute;inset:0;width:" + pct + "%;background:color-mix(in srgb, var(--accent) 16%, transparent)";
      var label = el("span", null, options.label(row));
      label.style.cssText = "position:relative;white-space:nowrap;overflow:hidden;text-overflow:ellipsis";
      if (options.bad && options.bad(row)) label.style.color = "var(--bad)";
      var value = el("span", null, fmt.format(Number(row.n)));
      value.style.cssText = "position:relative;color:var(--muted);font-variant-numeric:tabular-nums";
      line.append(fill, label, value);
      line.title = options.title ? options.title(row) : "";
      root.append(line);
    });
  }

  function render(data) {
    renderTiles(data);
    renderChart(data);
    renderList("countries", data.countries || [], { label: (row) => countryLabel(row.country) + " " + (row.country || "") });
    renderList("origins", data.origins || [], { label: (row) => originLabel(row.origin) });
    renderList("clients", data.clients || [], { label: (row) => CLIENT_LABELS[row.client] || row.client || "unknown" });
    renderList("mimes", data.mimes || [], { label: (row) => MIME_LABELS[row.mime] || row.mime || "unknown" });
    renderList("caches", data.caches || [], { label: (row) => CACHE_LABELS[row.cache] || row.cache || "not applicable" });
    renderList("statuses", data.statuses || [], {
      label: (row) => row.status,
      bad: (row) => Number(row.status) >= 400,
    });
    renderList("errors", data.errors || [], {
      label: (row) => ERROR_LABELS[row.kind] || row.kind,
      bad: () => true,
    });
    renderList("hosts", data.hosts || [], {
      label: (row) => row.host + "  [" + row.status + "]",
      bad: () => true,
      title: (row) => row.host + " returned " + row.status,
    });
  }

  function load() {
    status.textContent = "Loading…";
    fetch("/api/stats?" + new URLSearchParams(state), { headers: { accept: "application/json" } })
      .then((response) => {
        if (response.status === 401) { location.reload(); return null; }
        return response.json().then((body) => {
          if (!response.ok) throw new Error(body.error || "HTTP " + response.status);
          return body;
        });
      })
      .then((data) => {
        if (!data) return;
        render(data);
        status.textContent = "Updated " + new Date().toLocaleTimeString();
      })
      .catch((error) => { status.textContent = "Error: " + error.message; });
  }

  function go(patch) {
    Object.assign(state, patch);
    var query = new URLSearchParams(state).toString();
    history.replaceState(null, "", location.pathname + (query ? "?" + query : ""));
    paintControls();
    load();
  }

  var ranges = $("ranges");
  CFG.ranges.forEach((range) => {
    var button = el("button", null, range);
    button.type = "button";
    button.dataset.range = range;
    button.style.cssText = "padding:7px 12px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--fg);cursor:pointer";
    button.addEventListener("click", () => go({ range }));
    ranges.append(button);
  });

  function fillSelect(id, values, labels) {
    var select = $(id);
    values.forEach((value) => {
      var option = el("option", null, labels[value] || value);
      option.value = value;
      select.append(option);
    });
    select.value = state[id];
    select.addEventListener("change", () => go({ [id]: select.value }));
  }
  fillSelect("mime", CFG.mimes, MIME_LABELS);
  fillSelect("cache", CFG.caches, CACHE_LABELS);
  $("refresh").addEventListener("click", load);

  function paintControls() {
    Array.from(ranges.children).forEach((button) => {
      var active = button.dataset.range === state.range;
      button.style.background = active ? "var(--accent)" : "var(--card)";
      button.style.color = active ? "#fff" : "var(--fg)";
      button.style.borderColor = active ? "var(--accent)" : "var(--line)";
    });
  }
  paintControls();
  load();
})();
</script>`
  );
}
