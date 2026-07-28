// Data-source seam — the ONE place the two run modes differ.
//
// Payload schema: docs/ARCHITECTURE.md §4.2.
//
// The desk consumes ONE interface and never knows which adapter feeds it:
//   loadScenario(id) -> { scenario, spotlight_assets, sec_per_bar, events[] }
// where `events` is a time-ordered stream of `order` / `reassess` items.
//
// Two adapters implement it:
//   - cannedSource  : deploy path. Fetches manifest.json -> <scenario>.json from the
//                     CDN. This is what Cloudflare Pages serves, and its bodies are
//                     recorder output (private/recorder), never hand-written.
//   - liveSource    : fork / CPU path. A cloner runs pipeline.one_step_var locally and
//                     the browser pulls its events over HTTP. Shipping this is what
//                     makes "runs live on CPU" true of a bare clone.

// Canned assets under app/public/data. `basePath` rewrites markup and next/link, never
// fetch(), so the prefix has to be applied here by hand or a proxied deploy 404s on the
// payloads while the page around them loads fine.
const DATA_BASE = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/data`;

async function fetchJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`fetch failed ${res.status}: ${url}`);
  return res.json();
}

// --- Canned adapter (deploy) ---------------------------------------------------
const cannedSource = {
  async manifest() {
    return fetchJson(`${DATA_BASE}/manifest.json`);
  },
  async load(scenarioId) {
    const manifest = await this.manifest();
    const entry = manifest.scenarios.find((s) => s.id === scenarioId);
    if (!entry) throw new Error(`unknown scenario: ${scenarioId}`);
    return fetchJson(`${DATA_BASE}/${entry.file}`);
  },
};

// --- Live adapter (truly-live, fork / CPU) -------------------------------------
// The browser DRIVES the compute: fetch `session` once (order tape + bar grid, ms), then
// pull each `bar/<n>` on demand as the market clock crosses it — the first risk snapshot
// lands after ONE real fit (~10 s), not the whole session. The Python runner
// generates its own random order flow (fresh seed) and fits each bar through
// pipeline.one_step_var. Start it with `python -m dccmgarch.serving.live_server`
// (start-dev.bat launches it in live mode). The static export never bundles this — a
// local fork flips NEXT_PUBLIC_DATA_MODE=live.
const LIVE_BASE = process.env.NEXT_PUBLIC_LIVE_URL || "http://127.0.0.1:8787";

function liveUnreachable(e) {
  return new Error(
    `liveSource: live runner unreachable at ${LIVE_BASE} — start it with ` +
      `\`python -m dccmgarch.serving.live_server\` (or start-dev.bat in live mode). ${e.message}`
  );
}

const liveSource = {
  // Pass 1 only (meta + order tape + bar grid). Optional `params` are bake overrides (seed,
  // orders_lambda, max_bars, …) the server validates; the terminal sends none — pacing is
  // dialled in dccmgarch/live/config.py. The server echoes the seed it used so the per-bar
  // calls stay consistent across this session.
  async session(scenarioId, params) {
    const qs = params && Object.keys(params).length ? `?${new URLSearchParams(params)}` : "";
    try {
      return await fetchJson(`${LIVE_BASE}/live/${scenarioId}/session${qs}`);
    } catch (e) {
      throw liveUnreachable(e);
    }
  },
  // One bar's fit. `params` MUST carry the session's echoed `seed` so the stateless server
  // reproduces this session's exact tape and fits the book that bar carries.
  async bar(scenarioId, ordinal, params) {
    const qs = params && Object.keys(params).length ? `?${new URLSearchParams(params)}` : "";
    return fetchJson(`${LIVE_BASE}/live/${scenarioId}/bar/${ordinal}${qs}`);
  },
};

// Mode is compile-time-ish: the deployed (static export) build uses canned; a local
// fork can flip this to "live". Kept as a single switch so nothing else branches.
// `.trim()` is deliberate: Windows `cmd` folds the space before `&&` into a `set VAR=x`
// value, so a launcher can hand us "live " and the strict compare would silently fall
// back to canned playback — a failure that looks like a broken model, not a broken env.
const MODE = process.env.NEXT_PUBLIC_DATA_MODE?.trim() === "live" ? "live" : "canned";

// True when the live transport is present: the terminal drives the truly-live engine
// (session + per-bar fits) instead of replaying a canned payload.
export const isLiveMode = MODE === "live";

// Canned replay path (deploy): one recorded payload, played by createPlayback.
export async function loadScenario(scenarioId) {
  return cannedSource.load(scenarioId);
}

// Truly-live path (fork/CPU): meta once, then fits on demand. Driven by createLivePlayback.
export async function loadLiveSession(scenarioId, params) {
  return liveSource.session(scenarioId, params);
}
export async function loadLiveBar(scenarioId, ordinal, params) {
  return liveSource.bar(scenarioId, ordinal, params);
}

export async function loadManifest() {
  return cannedSource.manifest();
}
