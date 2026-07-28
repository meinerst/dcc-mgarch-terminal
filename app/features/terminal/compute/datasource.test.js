import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const MANIFEST = {
  version: "2026-07-25T10:00:00Z",
  scenarios: [
    { id: "calm", file: "calm.json", bytes: 1, sha256: "x", subset: { date: "2021-10-14" } },
    { id: "crash", file: "crash.json", bytes: 2, sha256: "y" },
  ],
};

function mockFetch(routes) {
  return vi.fn(async (url) => {
    const body = routes[url];
    if (body === undefined) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => body };
  });
}

// The mode switch is read once at module load, so each case imports a fresh module.
async function importDatasource(mode) {
  vi.resetModules();
  if (mode === undefined) vi.stubEnv("NEXT_PUBLIC_DATA_MODE", "");
  else vi.stubEnv("NEXT_PUBLIC_DATA_MODE", mode);
  return import("./datasource");
}

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch({}));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("mode switch", () => {
  it("defaults to canned, so a deployed build never computes locally", async () => {
    const { isLiveMode } = await importDatasource(undefined);
    expect(isLiveMode).toBe(false);
  });

  it("selects live mode when the launcher asks for it", async () => {
    const { isLiveMode } = await importDatasource("live");
    expect(isLiveMode).toBe(true);
  });

  // Windows `cmd` folds the space before `&&` into a `set VAR=value` value, so the
  // launcher can hand us "live " — a strict compare would silently fall back to canned
  // playback, which looks like a broken model rather than a broken environment.
  it("tolerates trailing whitespace from the launcher", async () => {
    const { isLiveMode } = await importDatasource("live ");
    expect(isLiveMode).toBe(true);
  });
});

describe("canned adapter", () => {
  it("resolves a scenario through the manifest", async () => {
    const payload = { scenario: "calm", events: [] };
    vi.stubGlobal("fetch", mockFetch({ "/data/manifest.json": MANIFEST, "/data/calm.json": payload }));

    const { loadScenario } = await importDatasource(undefined);
    await expect(loadScenario("calm")).resolves.toEqual(payload);
  });

  it("names the scenario that is missing from the manifest", async () => {
    vi.stubGlobal("fetch", mockFetch({ "/data/manifest.json": MANIFEST }));

    const { loadScenario } = await importDatasource(undefined);
    await expect(loadScenario("nope")).rejects.toThrow(/unknown scenario: nope/);
  });

  it("reports the failing URL and status", async () => {
    vi.stubGlobal("fetch", mockFetch({}));

    const { loadManifest } = await importDatasource(undefined);
    await expect(loadManifest()).rejects.toThrow(/fetch failed 404: \/data\/manifest\.json/);
  });

  it("carries the session window on manifest entries so the sidebar needs no payload", async () => {
    vi.stubGlobal("fetch", mockFetch({ "/data/manifest.json": MANIFEST }));

    const { loadManifest } = await importDatasource(undefined);
    const manifest = await loadManifest();
    expect(manifest.scenarios[0].subset).toEqual({ date: "2021-10-14" });
  });
});

describe("live adapter", () => {
  const BASE = "http://127.0.0.1:8787";

  it("opens a session and threads bake overrides as query parameters", async () => {
    const meta = { scenario: "calm", seed: 7, orders: [], bars: [] };
    const fetchMock = mockFetch({ [`${BASE}/live/calm/session?seed=7`]: meta });
    vi.stubGlobal("fetch", fetchMock);

    const { loadLiveSession } = await importDatasource("live");
    await expect(loadLiveSession("calm", { seed: "7" })).resolves.toEqual(meta);
  });

  it("pulls one bar at a time", async () => {
    const event = { type: "reassess", var: 1000 };
    vi.stubGlobal("fetch", mockFetch({ [`${BASE}/live/calm/bar/3?seed=7`]: event }));

    const { loadLiveBar } = await importDatasource("live");
    await expect(loadLiveBar("calm", 3, { seed: "7" })).resolves.toEqual(event);
  });

  // A live session that cannot reach the runner is an environment problem, and the
  // message has to say so — otherwise it reads as a model failure.
  it("explains how to start the runner when the session cannot be opened", async () => {
    vi.stubGlobal("fetch", mockFetch({}));

    const { loadLiveSession } = await importDatasource("live");
    await expect(loadLiveSession("calm")).rejects.toThrow(/live runner unreachable/);
  });
});
