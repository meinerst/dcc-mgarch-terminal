import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createLivePlayback } from "./livePlayback";
import { installRaf } from "../../../test-utils/raf";

const REPLAY_FACTOR = 100;
const SEC_PER_BAR = 100;

function order(marketTs, asset, shares = 100, fillPrice = 50) {
  return { type: "order", market_ts: marketTs, asset, side: "buy", shares, fillPrice };
}

function reassessEvent(extra = {}) {
  return {
    type: "reassess",
    compute_seconds: 0.4,
    var: 1000,
    es: 1400,
    converged: true,
    degraded: false,
    held_names: 3,
    dcc: { a: 0.03, b: 0.95, nu_marginal_avg: 7 },
    corr_spotlight: [[1]],
    corr: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
    marketPrices: { AAPL: 50, JPM: 30, CVX: 80 },
    sigma_forecast: [0.01, 0.01, 0.01],
    ...extra,
  };
}

function sessionMeta(overrides = {}) {
  return {
    scenario: "calm",
    spotlight_assets: ["AAPL", "JPM", "CVX"],
    replay_factor: REPLAY_FACTOR,
    sec_per_bar: SEC_PER_BAR,
    min_names_for_risk: 3,
    session: { date: "2021-10-14", open: "09:30", close: "16:00", tz: "ET" },
    subset: { date: "2021-10-14" },
    cpu: "Test CPU",
    seed: 42,
    orders: [],
    bars: [{ ordinal: 0, market_ts: 0 }],
    ...overrides,
  };
}

// A fetchBar the test drives by hand: every call parks until it is resolved, so the
// engine's in-flight state can be inspected mid-fit.
function deferredFetcher() {
  const calls = [];
  const fetchBar = (ordinal, overrides) => {
    let settle;
    const promise = new Promise((resolve, reject) => {
      settle = { resolve, reject };
    });
    calls.push({ ordinal, overrides, ...settle });
    return promise;
  };
  return { fetchBar, calls, last: () => calls[calls.length - 1] };
}

let raf;
let states;
const onState = (s) => states.push(s);
const latestState = () => states[states.length - 1];

beforeEach(() => {
  raf = installRaf();
  states = [];
});

afterEach(() => raf.restore());

describe("session start", () => {
  it("runs the order tape off session meta without waiting for any fit", async () => {
    const { fetchBar } = deferredFetcher();
    const meta = sessionMeta({ orders: [order(10, "AAPL"), order(20, "JPM")] });
    const pb = createLivePlayback(meta, fetchBar, onState);
    pb.start();

    await raf.advance(0.4);
    expect(latestState().ticker).toHaveLength(2);
    expect(latestState().latest).toBeNull(); // no fit has landed yet
    pb.stop();
  });

  it("fetches a bar once the market clock reaches it", async () => {
    const f = deferredFetcher();
    const meta = sessionMeta({ bars: [{ ordinal: 0, market_ts: 0 }, { ordinal: 1, market_ts: 100 }] });
    const pb = createLivePlayback(meta, f.fetchBar, onState);
    pb.start();

    await raf.advance(0.1);
    expect(f.calls.map((c) => c.ordinal)).toEqual([0]);

    f.last().resolve(reassessEvent());
    await raf.advance(0.1);
    expect(latestState().latest.var).toBe(1000);
    expect(latestState().history[0]).toMatchObject({ kind: "computed", seconds: 0.4 });
    pb.stop();
  });
});

describe("opening fit", () => {
  it("fires as soon as the book crosses the risk floor, before the next bar", async () => {
    const f = deferredFetcher();
    const meta = sessionMeta({
      orders: [order(10, "AAPL"), order(20, "JPM"), order(30, "CVX")],
      bars: [{ ordinal: 0, market_ts: 0 }, { ordinal: 1, market_ts: 200 }],
    });
    const pb = createLivePlayback(meta, f.fetchBar, onState);
    pb.start();

    // Bar 0 is fetched at once and comes back dead (the session opens on an empty book).
    await raf.advance(0.05);
    f.last().resolve({ type: "dead", reason: "book_below_min_names", held_names: 0 });

    await raf.advance(0.4); // book reaches three names at market_ts 30 == 0.3s real
    const opening = f.last();
    expect(opening.ordinal).toBe(0); // bar 0's estimation window ...
    expect(opening.overrides.book_ts).toBeGreaterThanOrEqual(30); // ... priced at the live book
    pb.stop();
  });

  it("discards the opening fit when the book falls back under the floor mid-fit", async () => {
    const f = deferredFetcher();
    const meta = sessionMeta({
      orders: [
        order(10, "AAPL"),
        order(20, "JPM"),
        order(30, "CVX"),
        order(60, "CVX", -100), // flattens CVX again, back to two held names
      ],
      bars: [{ ordinal: 0, market_ts: 0 }, { ordinal: 1, market_ts: 400 }],
    });
    const pb = createLivePlayback(meta, f.fetchBar, onState);
    pb.start();

    await raf.advance(0.05);
    f.last().resolve({ type: "dead", reason: "book_below_min_names", held_names: 0 });
    await raf.advance(0.35); // opening fit launched on a 3-name book

    await raf.advance(0.4); // CVX flattens while the fit is out
    f.last().resolve(reassessEvent());
    await raf.advance(0.1);

    expect(latestState().latest).toBeNull(); // the stale result never lands
    expect(latestState().history[0].kind).toBe("aborted");
    pb.stop();
  });

  it("fires at most once per run", async () => {
    const f = deferredFetcher();
    const meta = sessionMeta({
      orders: [order(10, "AAPL"), order(20, "JPM"), order(30, "CVX")],
      bars: [{ ordinal: 0, market_ts: 0 }, { ordinal: 1, market_ts: 400 }],
    });
    const pb = createLivePlayback(meta, f.fetchBar, onState);
    pb.start();

    await raf.advance(0.05);
    f.last().resolve({ type: "dead", reason: "book_below_min_names", held_names: 0 });
    await raf.advance(0.4);
    f.last().resolve(reassessEvent());
    await raf.advance(1.0);

    const openingCalls = f.calls.filter((c) => c.overrides?.book_ts != null);
    expect(openingCalls).toHaveLength(1);
    pb.stop();
  });
});

describe("skip to latest", () => {
  it("never fetches a bar that went stale while a fit was in flight", async () => {
    const f = deferredFetcher();
    const meta = sessionMeta({
      bars: [
        { ordinal: 0, market_ts: 0 },
        { ordinal: 1, market_ts: 100 },
        { ordinal: 2, market_ts: 200 },
      ],
    });
    const pb = createLivePlayback(meta, f.fetchBar, onState);
    pb.start();

    await raf.advance(2.4); // bars 1 and 2 both arrive while bar 0 is out
    f.calls[0].resolve(reassessEvent());
    await raf.advance(0.1);

    expect(f.calls.map((c) => c.ordinal)).toEqual([0, 2]); // bar 1 was dropped unfetched
    pb.stop();
  });
});

describe("pause", () => {
  // Regression: pause used to route through stop(), which bumps the fetch token. The fit
  // already on the CPU then resolved into a discarded token and the engine stranded —
  // no further bar was ever fetched and the desk silently froze.
  it("lands a fit that was in flight across the pause", async () => {
    const f = deferredFetcher();
    const meta = sessionMeta({ bars: [{ ordinal: 0, market_ts: 0 }, { ordinal: 1, market_ts: 100 }] });
    const pb = createLivePlayback(meta, f.fetchBar, onState);
    pb.start();
    await raf.advance(0.05);

    pb.pause();
    f.calls[0].resolve(reassessEvent());
    await raf.advance(0.1); // paused: no frames, nothing lands yet
    pb.resume();
    await raf.advance(0.1);

    expect(latestState().latest.var).toBe(1000);
    pb.stop();
  });

  it("keeps fetching bars after a pause taken mid-fit", async () => {
    const f = deferredFetcher();
    const meta = sessionMeta({ bars: [{ ordinal: 0, market_ts: 0 }, { ordinal: 1, market_ts: 100 }] });
    const pb = createLivePlayback(meta, f.fetchBar, onState);
    pb.start();
    await raf.advance(0.05);

    pb.pause();
    pb.resume();
    f.calls[0].resolve(reassessEvent());
    await raf.advance(1.5);

    expect(f.calls.map((c) => c.ordinal)).toEqual([0, 1]);
    pb.stop();
  });
});

describe("teardown", () => {
  it("ignores a fit that resolves after the engine was stopped", async () => {
    const f = deferredFetcher();
    const meta = sessionMeta({ bars: [{ ordinal: 0, market_ts: 0 }] });
    const pb = createLivePlayback(meta, f.fetchBar, onState);
    pb.start();
    await raf.advance(0.05);

    pb.stop();
    f.calls[0].resolve(reassessEvent());
    await raf.advance(0.1);

    expect(latestState().latest).toBeNull();
  });
});

describe("run completion", () => {
  // The tail of the tape is coverage for the final fit's grind, over-provisioned for a slow
  // machine. Ending on the tape drained it instead: the desk printed fills for 37-40 real
  // seconds after the compute panel already read "sequence complete".
  it("ends on the last fit, not on the tail of the order tape", async () => {
    const f = deferredFetcher();
    const meta = sessionMeta({
      bars: [{ ordinal: 0, market_ts: 0 }],
      orders: [order(10, "AAPL"), order(300, "JPM"), order(450, "CVX")],
    });
    const pb = createLivePlayback(meta, f.fetchBar, onState);
    pb.start();
    await raf.advance(0.05);

    f.calls[0].resolve(reassessEvent());
    await raf.advance(0.1); // the tape still runs to 4.5s real

    expect(latestState().done).toBe(true);
    pb.stop();
  });
});

describe("compute clock", () => {
  it("never claims completion while the fit is still running", async () => {
    const f = deferredFetcher();
    const meta = sessionMeta({ bars: [{ ordinal: 0, market_ts: 0 }, { ordinal: 1, market_ts: 10000 }] });
    const pb = createLivePlayback(meta, f.fetchBar, onState);
    pb.start();

    await raf.advance(30); // far past the first-run estimate of 10s
    const { compute } = latestState();
    expect(compute.running).toBe(true);
    expect(compute.progress).toBeLessThan(1);
    expect(compute.elapsed).toBeGreaterThan(compute.target); // overrun is reported honestly
    pb.stop();
  });

  // The twin of the canned engine's overrun test: a slow server must leave the desk
  // visibly alive, not frozen at the cap for the rest of the fit.
  it("keeps the fill moving while a fit overruns its estimate", async () => {
    const f = deferredFetcher();
    const meta = sessionMeta({ bars: [{ ordinal: 0, market_ts: 0 }, { ordinal: 1, market_ts: 10000 }] });
    const pb = createLivePlayback(meta, f.fetchBar, onState);
    pb.start();

    await raf.advance(20); // past the 10s first-run estimate, fetch still out
    const early = latestState().compute;
    await raf.advance(10);
    const later = latestState().compute;

    expect(later.progress).toBeGreaterThan(early.progress);
    expect(later.progress).toBeLessThan(0.97);
    pb.stop();
  });
});

// A rejected fetch and a non-finite fit used to arrive as the same event, so a runner that
// blinked cost a whole reassessment for a reason that had nothing to do with risk.
describe("failed fetches", () => {
  const twoBars = { bars: [{ ordinal: 0, market_ts: 0 }, { ordinal: 1, market_ts: 100 }] };

  it("asks again for a bar whose fetch failed", async () => {
    const f = deferredFetcher();
    const pb = createLivePlayback(sessionMeta(twoBars), f.fetchBar, onState);
    pb.start();
    await raf.advance(0.05);

    f.calls[0].reject(new Error("live runner unreachable"));
    await raf.advance(0.05);

    expect(f.calls.map((c) => c.ordinal)).toEqual([0, 0]);
    pb.stop();
  });

  it("gives up after one retry rather than hammering a runner that is down", async () => {
    const f = deferredFetcher();
    const pb = createLivePlayback(sessionMeta(twoBars), f.fetchBar, onState);
    pb.start();
    await raf.advance(0.05);

    f.calls[0].reject(new Error("live runner unreachable"));
    await raf.advance(0.05);
    f.calls[1].reject(new Error("live runner unreachable"));
    await raf.advance(1.5);

    expect(f.calls.map((c) => c.ordinal)).toEqual([0, 0, 1]); // dropped, and bar 1 still runs
    expect(latestState().history).toHaveLength(0); // a dropped bar leaves no trace
    pb.stop();
  });

  // Same window, same seed, and the pathology is in the correlation forecast rather than in
  // the book: asking again would spend the same seconds reaching the same answer.
  it("does not re-ask for a bar the server answered as non-finite", async () => {
    const f = deferredFetcher();
    const pb = createLivePlayback(sessionMeta(twoBars), f.fetchBar, onState);
    pb.start();
    await raf.advance(0.05);

    f.calls[0].resolve({ type: "skip", reason: "non_finite" });
    await raf.advance(1.5);

    expect(f.calls.map((c) => c.ordinal)).toEqual([0, 1]);
    pb.stop();
  });

  it("lets a fresher bar beat the retry", async () => {
    const f = deferredFetcher();
    const pb = createLivePlayback(sessionMeta(twoBars), f.fetchBar, onState);
    pb.start();
    await raf.advance(1.1); // bar 1 arrives while bar 0's fetch is still out

    f.calls[0].reject(new Error("connection reset"));
    await raf.advance(0.05);

    // The retry is requeued behind bar 1, so skip-to-latest still picks the freshest.
    expect(f.calls.map((c) => c.ordinal)).toEqual([0, 1]);
    pb.stop();
  });
});
