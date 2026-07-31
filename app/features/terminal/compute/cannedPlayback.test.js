import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPlayback } from "./cannedPlayback";
import { installRaf } from "../../../test-utils/raf";

// Round numbers over the real ones: replay 100x on 100-second bars puts bar k at
// exactly k real seconds, so every assertion below reads off the market clock directly.
const REPLAY_FACTOR = 100;
const SEC_PER_BAR = 100;

function order(marketTs, asset = "AAPL", shares = 100, fillPrice = 50) {
  return { type: "order", market_ts: marketTs, asset, side: shares > 0 ? "buy" : "sell", shares, fillPrice };
}

function reassess(marketTs, computeSeconds, extra = {}) {
  return {
    type: "reassess",
    market_ts: marketTs,
    compute_seconds: computeSeconds,
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

function payload(events, overrides = {}) {
  return {
    scenario: "calm",
    spotlight_assets: ["AAPL", "JPM", "CVX"],
    replay_factor: REPLAY_FACTOR,
    sec_per_bar: SEC_PER_BAR,
    min_names_for_risk: 3,
    session: { date: "2021-10-14", open: "09:30", close: "16:00", tz: "ET" },
    subset: { date: "2021-10-14" },
    cpu: "Test CPU",
    events,
    ...overrides,
  };
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

describe("payload schema", () => {
  it("refuses a payload whose orders predate the market-clock timeline", () => {
    const stale = payload([{ type: "order", asset: "AAPL", shares: 10, fillPrice: 50 }]);
    expect(() => createPlayback(stale, onState)).toThrow(/market_ts/);
  });

  it("refuses a payload whose reassessments carry no held-name count", () => {
    const stale = payload([{ ...reassess(100, 0.5), held_names: undefined }]);
    expect(() => createPlayback(stale, onState)).toThrow(/held_names/);
  });
});

describe("market clock", () => {
  it("fires an order when the market clock crosses its stamp, not before", async () => {
    const pb = createPlayback(payload([order(50), reassess(100, 0.2)]), onState);
    pb.start();

    await raf.advance(0.3);
    expect(latestState().ticker).toHaveLength(0);

    await raf.advance(0.4); // market clock now past 50s
    expect(latestState().ticker).toHaveLength(1);
    pb.stop();
  });

  it("anchors the displayed clock to the session open", async () => {
    const pb = createPlayback(payload([order(50), reassess(100, 0.2)]), onState);
    pb.start();
    await raf.advance(1);

    // 09:30 open + ~100 market seconds elapsed
    expect(latestState().marketSeconds).toBeGreaterThan(9 * 3600 + 30 * 60);
    pb.stop();
  });
});

describe("compute scheduling", () => {
  it("lands a fit after its recorded wall-time and reports it as computed", async () => {
    const pb = createPlayback(payload([order(10), reassess(100, 0.5)]), onState);
    pb.start();

    await raf.advance(1.1); // bar arrives at 1.0s
    expect(latestState().latest).toBeNull();
    expect(latestState().compute.running).toBe(true);

    await raf.advance(0.6);
    expect(latestState().latest.var).toBe(1000);
    expect(latestState().history[0]).toMatchObject({ kind: "computed", seconds: 0.5 });
    pb.stop();
  });

  it("drops stale bars and fits the freshest one instead", async () => {
    // Bar 1 takes 2.5s of compute while bars 2 and 3 arrive at 2s and 3s.
    const pb = createPlayback(
      payload([
        order(10),
        reassess(100, 2.5, { var: 111 }),
        reassess(200, 0.2, { var: 222 }),
        reassess(300, 0.2, { var: 333 }),
      ]),
      onState
    );
    pb.start();

    await raf.advance(4.2);
    const state = latestState();
    expect(state.latest.var).toBe(333); // bar 2 was skipped, bar 3 won
    // Skipping is normal scheduling, so the dropped bar leaves no trace.
    expect(state.history.map((h) => h.index)).toEqual([2, 0]);
    pb.stop();
  });

  it("aborts an in-flight fit when a dead bar arrives", async () => {
    const pb = createPlayback(
      payload([
        order(10),
        reassess(100, 2.0),
        { type: "dead", market_ts: 200, reason: "book_below_min_names", held_names: 1 },
      ]),
      onState
    );
    pb.start();

    await raf.advance(2.4);
    const state = latestState();
    expect(state.history.map((h) => h.kind)).toEqual(["dead", "aborted"]);
    expect(state.latest).toBeNull(); // the aborted result never lands
    expect(state.compute.dead).toBe(true);
    pb.stop();
  });

  it("holds the completed frame briefly so a landing is visible", async () => {
    const pb = createPlayback(
      payload([order(10), reassess(100, 0.2), reassess(200, 0.2)]),
      onState
    );
    pb.start();

    await raf.advance(1.3);
    expect(latestState().compute).toMatchObject({ landed: true, progress: 1 });
    pb.stop();
  });
});

describe("run completion", () => {
  it("reports done once the last fit lands", async () => {
    const pb = createPlayback(payload([order(10), reassess(100, 0.3)]), onState);
    pb.start();

    await raf.advance(1.0);
    expect(latestState().done).toBe(false);

    await raf.advance(1.0);
    expect(latestState().done).toBe(true);
    expect(latestState().compute.done).toBe(true);
    pb.stop();
  });

  // The tape is scheduled past the last bar on purpose, over-provisioned for a slow
  // machine's final fit. Ending on the tape instead of on the fit played that surplus out:
  // 37-40 real seconds of fills with the compute panel already reading "sequence complete".
  it("ends on the last fit, not on the tail of the order tape", async () => {
    const pb = createPlayback(
      payload([order(10), reassess(100, 0.3), order(300), order(450)]),
      onState
    );
    pb.start();

    await raf.advance(1.5); // bar at 1.0s real, fit lands at 1.3s; the tape runs to 4.5s
    expect(latestState().done).toBe(true);
    pb.stop();
  });

  it("clamps the market clock to the end of the order tape while a slow fit finishes", async () => {
    // The run ends when the last fit LANDS, so the clock free-runs through the fit. A
    // 6s fit would carry it 600 market-seconds past the open, past the tape's end.
    const pb = createPlayback(payload([order(10), reassess(100, 6)]), onState);
    pb.start();
    await raf.advance(7.5);

    // horizon = last bar (100) + ORDER_TAIL_GAPS(4) * sec_per_bar(100)
    const openSeconds = 9 * 3600 + 30 * 60;
    expect(latestState().done).toBe(true);
    expect(latestState().marketSeconds).toBeCloseTo(openSeconds + 500, 6);
  });
});

describe("pause", () => {
  it("does not credit paused wall-time to the clocks", async () => {
    const pb = createPlayback(
      payload([order(10), reassess(100, 0.3), reassess(400, 0.3)]),
      onState
    );
    pb.start();
    await raf.advance(1.5);
    const beforePause = latestState().realSeconds;

    pb.pause();
    await raf.advance(2); // no frames run while paused
    expect(latestState().realSeconds).toBe(beforePause);

    pb.resume();
    await raf.advance(0.2);
    expect(latestState().realSeconds).toBeCloseTo(beforePause + 0.2, 1);
    pb.stop();
  });

  it("is idempotent, so a double resume cannot run two loops", async () => {
    const pb = createPlayback(
      payload([order(10), reassess(100, 0.3), reassess(400, 0.3)]),
      onState
    );
    pb.start();
    pb.start();
    pb.resume();
    await raf.advance(0.5);

    expect(latestState().realSeconds).toBeCloseTo(0.5, 1);
    pb.stop();
  });
});
