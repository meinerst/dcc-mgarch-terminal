import { describe, expect, it } from "vitest";
import { createDesk } from "./desk";

const UNIVERSE = ["AAPL", "JPM", "CVX"];
const HALF_SPREAD = 0.0005;

function desk(overrides = {}) {
  return createDesk({ spotlightAssets: UNIVERSE, minNamesForRisk: 3, ...overrides });
}

function order(asset, shares, fillPrice, marketTs = 0) {
  return { type: "order", asset, shares, fillPrice, market_ts: marketTs };
}

// Snapshot with the clock/compute fields an engine would supply; the book-derived
// half is what these tests are about.
function snap(d) {
  return d.snapshot({ marketSeconds: 0, realSeconds: 0, compute: {}, done: false });
}

function rowFor(state, ticker) {
  return state.rows.find((r) => r.ticker === ticker);
}

describe("book accounting", () => {
  it("opens a long at the fill price and marks it there", () => {
    const d = desk();
    d.applyOrder(order("AAPL", 100, 50));

    const row = rowFor(snap(d), "AAPL");
    expect(row.shares).toBe(100);
    expect(row.inventoryPrice).toBe(50);
    expect(row.marketPrice).toBe(50);
    expect(row.exposure).toBe(5000);
    expect(row.realized).toBe(0);
  });

  it("averages the entry price when adding to a position", () => {
    const d = desk();
    d.applyOrder(order("AAPL", 100, 50));
    d.applyOrder(order("AAPL", 100, 60));

    const row = rowFor(snap(d), "AAPL");
    expect(row.shares).toBe(200);
    expect(row.inventoryPrice).toBe(55);
  });

  it("realizes P&L on a reduction and leaves the entry price alone", () => {
    const d = desk();
    d.applyOrder(order("AAPL", 100, 50));
    d.applyOrder(order("AAPL", -40, 60));

    const row = rowFor(snap(d), "AAPL");
    expect(row.shares).toBe(60);
    expect(row.inventoryPrice).toBe(50);
    expect(row.realized).toBeCloseTo(400, 10); // 40 shares * $10
  });

  it("clears the entry price when a position closes out flat", () => {
    const d = desk();
    d.applyOrder(order("AAPL", 100, 50));
    d.applyOrder(order("AAPL", -100, 55));

    const row = rowFor(snap(d), "AAPL");
    expect(row.shares).toBe(0);
    expect(row.inventoryPrice).toBeNull();
    expect(row.realized).toBeCloseTo(500, 10);
    expect(row.unrealized).toBe(0);
  });

  it("closes the old position and re-opens the remainder when flipping through zero", () => {
    const d = desk();
    d.applyOrder(order("AAPL", 100, 50));
    d.applyOrder(order("AAPL", -150, 60)); // close 100 long, open 50 short

    const row = rowFor(snap(d), "AAPL");
    expect(row.shares).toBe(-50);
    expect(row.inventoryPrice).toBe(60);
    expect(row.realized).toBeCloseTo(1000, 10); // only the closed 100 realize
  });

  it("profits a short when the market falls below the entry", () => {
    const d = desk();
    d.applyOrder(order("AAPL", -100, 50));
    d.applyOrder(order("AAPL", 40, 45));

    const row = rowFor(snap(d), "AAPL");
    expect(row.shares).toBe(-60);
    expect(row.realized).toBeCloseTo(200, 10); // 40 shares * $5 in the desk's favour
  });

  it("ignores orders in names outside the payload universe", () => {
    const d = desk();
    d.applyOrder(order("TSLA", 100, 50));

    expect(snap(d).rows).toHaveLength(0);
  });
});

describe("spread income", () => {
  it("accrues half the spread on traded notional regardless of side", () => {
    const d = desk();
    d.applyOrder(order("AAPL", 100, 50));
    d.applyOrder(order("AAPL", -100, 50));

    const row = rowFor(snap(d), "AAPL");
    expect(row.spreadPnl).toBeCloseTo(2 * HALF_SPREAD * 5000, 10);
    expect(row.spreadPnl).toBeGreaterThan(0);
  });

  it("carries inventory at the mid, so spread income is additive to P&L", () => {
    const d = desk();
    d.applyOrder(order("AAPL", 100, 50));

    const row = rowFor(snap(d), "AAPL");
    expect(row.inventoryPrice).toBe(50); // not shaded by the half-spread
    expect(row.totalPnl).toBeCloseTo(row.realized + row.unrealized + row.spreadPnl, 10);
  });
});

describe("display axis", () => {
  it("adds a name on its first fill and keeps it after it goes flat", () => {
    const d = desk();
    d.applyOrder(order("JPM", 10, 100));
    expect(snap(d).activeAssets).toEqual(["JPM"]);

    d.applyOrder(order("JPM", -10, 100));
    expect(snap(d).activeAssets).toEqual(["JPM"]); // realized P&L still belongs to the book
    expect(d.heldNamesCount()).toBe(0); // but it is no longer HELD
  });

  it("keeps the payload universe order rather than fill order", () => {
    const d = desk();
    d.applyOrder(order("CVX", 10, 100));
    d.applyOrder(order("AAPL", 10, 100));

    expect(snap(d).activeAssets).toEqual(["AAPL", "CVX"]);
  });
});

describe("exposure and P&L totals", () => {
  it("adds longs and shorts for gross and nets them for net", () => {
    const d = desk();
    d.applyOrder(order("AAPL", 100, 50)); // +5000
    d.applyOrder(order("JPM", -100, 30)); // -3000

    const state = snap(d);
    expect(state.grossExposure).toBe(8000);
    expect(state.netExposure).toBe(2000);
  });

  it("reconciles the total P&L with the per-row parts", () => {
    const d = desk();
    d.applyOrder(order("AAPL", 100, 50));
    d.applyOrder(order("AAPL", -40, 60));
    d.applyOrder(order("JPM", -100, 30));

    const state = snap(d);
    const parts = state.rows.reduce((s, r) => s + r.realized + r.unrealized + r.spreadPnl, 0);
    expect(state.totalPnl).toBeCloseTo(parts, 10);
  });

  it("weights rows by gross-exposure share", () => {
    const d = desk();
    d.applyOrder(order("AAPL", 100, 50)); // 5000 of 8000
    d.applyOrder(order("JPM", -100, 30)); // 3000 of 8000

    const state = snap(d);
    expect(rowFor(state, "AAPL").weight).toBeCloseTo(0.625, 10);
    expect(rowFor(state, "JPM").weight).toBeCloseTo(0.375, 10);
    expect(state.rows.reduce((s, r) => s + r.weight, 0)).toBeCloseTo(1, 10);
  });
});

describe("risk gating", () => {
  const reassess = (heldNames) => ({
    type: "reassess",
    var: 1000,
    held_names: heldNames,
    dcc: { a: 0.03, b: 0.95, nu_marginal_avg: 7 },
    market_ts: 300,
  });

  it("stays inert until a landed fit priced the minimum number of names", () => {
    const d = desk();
    expect(snap(d).riskLive).toBe(false);

    d.landReassess(reassess(2));
    expect(snap(d).riskLive).toBe(false);

    d.landReassess(reassess(3));
    expect(snap(d).riskLive).toBe(true);
  });

  it("counts landed fits so panels can dedupe on latestIndex", () => {
    const d = desk();
    expect(snap(d).latestIndex).toBe(-1);

    d.landReassess(reassess(3));
    d.landReassess(reassess(3));
    expect(snap(d).latestIndex).toBe(1);
  });

  it("records fitted DCC params only for landed fits", () => {
    const d = desk();
    d.pushHistory(0, 0, "dead", null);
    d.landReassess(reassess(3));

    const state = snap(d);
    expect(state.dccSeries).toEqual([{ a: 0.03, b: 0.95, marketTs: 300 }]);
    expect(state.history.map((h) => h.kind)).toEqual(["dead"]);
  });

  // Per-$1,000 exists to divide the book's SIZE out of the headline number, so it has to
  // divide by the book the fit was priced on — which the engine captures at bar arrival
  // and hands back here, seconds later.
  it("scales landed risk by the book the fit was priced on", () => {
    const d = desk();
    d.landReassess({ ...reassess(3), es: 1400 }, 2_000_000);

    expect(snap(d).riskSeries).toEqual([{ varPerK: 0.5, esPerK: 0.7, marketTs: 300 }]);
  });

  // A fit with no book gross contributes nothing rather than a point divided by whatever
  // the book has since grown to — the same rule the DCC series follows for dead bars.
  it("records no per-dollar point when the priced book is unknown", () => {
    const d = desk();
    d.applyOrder(order("AAPL", 100, 50));
    d.landReassess(reassess(3));

    expect(snap(d).riskSeries).toEqual([]);
  });

  it("reads gross exposure on demand for the engine to stamp on a bar", () => {
    const d = desk();
    d.applyOrder(order("AAPL", 100, 50));
    d.applyOrder(order("JPM", -20, 100)); // shorts add: both sides consume risk budget

    expect(d.grossExposureNow()).toBe(7000);
  });

  it("marks the position rows with the landed fit's market prices", () => {
    const d = desk();
    d.applyOrder(order("AAPL", 100, 50));
    d.landReassess({ ...reassess(3), marketPrices: { AAPL: 55 } });

    const row = rowFor(snap(d), "AAPL");
    expect(row.marketPrice).toBe(55);
    expect(row.unrealized).toBeCloseTo(500, 10);
  });
});

// Euler decomposition of portfolio VaR: componentVar_i = x_i (Hx)_i / x'Hx * VaR,
// divEffect_i = 1 - sign(x_i) * rho(i, book). H = sigma R sigma.
describe("Euler risk decomposition", () => {
  const fit = (corr, sigma, varDollars = 1000) => ({
    type: "reassess",
    var: varDollars,
    held_names: 3,
    corr,
    sigma_forecast: sigma,
    market_ts: 300,
  });

  const IDENTITY = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];

  it("splits the portfolio VaR with no residual", () => {
    const d = desk();
    d.applyOrder(order("AAPL", 100, 50));
    d.applyOrder(order("JPM", 200, 30));
    d.applyOrder(order("CVX", -50, 80));
    d.landReassess(
      fit(
        [
          [1, 0.6, 0.2],
          [0.6, 1, 0.1],
          [0.2, 0.1, 1],
        ],
        [0.01, 0.02, 0.015]
      )
    );

    const state = snap(d);
    const total = state.rows.reduce((s, r) => s + r.componentVar, 0);
    expect(total).toBeCloseTo(1000, 8);
  });

  it("splits an uncorrelated equal-risk book evenly", () => {
    const d = desk();
    d.applyOrder(order("AAPL", 100, 50));
    d.applyOrder(order("JPM", 100, 50));
    d.applyOrder(order("CVX", 100, 50));
    d.landReassess(fit(IDENTITY, [0.01, 0.01, 0.01], 900));

    for (const row of snap(d).rows) expect(row.componentVar).toBeCloseTo(300, 8);
  });

  it("reads an uncorrelated position as fully diversifying only when it is alone", () => {
    const d = desk();
    d.applyOrder(order("AAPL", 100, 50));
    d.applyOrder(order("JPM", 100, 50));
    d.applyOrder(order("CVX", 100, 50));
    d.landReassess(fit(IDENTITY, [0.01, 0.01, 0.01]));

    // Each name carries 1/sqrt(3) of the book's risk direction, so its correlation to
    // the book is 1/sqrt(3) and the effect is 1 - that.
    for (const row of snap(d).rows) {
      expect(row.divEffect).toBeCloseTo(1 - 1 / Math.sqrt(3), 8);
    }
  });

  it("reads a perfectly correlated long book as undiversified", () => {
    const d = desk();
    d.applyOrder(order("AAPL", 100, 50));
    d.applyOrder(order("JPM", 100, 50));
    d.applyOrder(order("CVX", 100, 50));
    d.landReassess(
      fit(
        [
          [1, 1, 1],
          [1, 1, 1],
          [1, 1, 1],
        ],
        [0.01, 0.01, 0.01]
      )
    );

    for (const row of snap(d).rows) expect(row.divEffect).toBeCloseTo(0, 8);
  });

  it("reports a hedge as above 1 and its component VaR as negative", () => {
    const d = desk();
    d.applyOrder(order("AAPL", 100, 50));
    d.applyOrder(order("JPM", 100, 50));
    d.applyOrder(order("CVX", -20, 50)); // small offsetting short
    d.landReassess(
      fit(
        [
          [1, 0.9, 0.9],
          [0.9, 1, 0.9],
          [0.9, 0.9, 1],
        ],
        [0.01, 0.01, 0.01]
      )
    );

    const hedge = rowFor(snap(d), "CVX");
    expect(hedge.divEffect).toBeGreaterThan(1);
    expect(hedge.componentVar).toBeLessThan(0);
  });

  it("leaves both columns empty when the payload carries no forecast inputs", () => {
    const d = desk();
    d.applyOrder(order("AAPL", 100, 50));
    d.landReassess({ type: "reassess", var: 1000, held_names: 3 });

    const row = rowFor(snap(d), "AAPL");
    expect(row.componentVar).toBeNull();
    expect(row.divEffect).toBeNull();
  });

  it("reports no diversification effect for a flat position", () => {
    const d = desk();
    d.applyOrder(order("AAPL", 100, 50));
    d.applyOrder(order("JPM", 100, 50));
    d.applyOrder(order("CVX", 100, 50));
    d.applyOrder(order("CVX", -100, 50)); // back to flat
    d.landReassess(fit(IDENTITY, [0.01, 0.01, 0.01]));

    const flat = rowFor(snap(d), "CVX");
    expect(flat.divEffect).toBeNull();
    expect(flat.componentVar).toBe(0);
  });

  it("indexes the correlation matrix by the payload universe, not the held subset", () => {
    // Only CVX (universe index 2) is held. Reading row 0 instead would pick AAPL's
    // sigma and silently price the wrong name.
    const d = desk();
    d.applyOrder(order("CVX", 100, 50));
    d.landReassess(fit(IDENTITY, [0.5, 0.5, 0.02], 1000));

    expect(rowFor(snap(d), "CVX").componentVar).toBeCloseTo(1000, 8);
  });

  it("leaves the columns empty when the book has no risk to split", () => {
    const d = desk();
    d.applyOrder(order("AAPL", 100, 50));
    d.applyOrder(order("AAPL", -100, 50)); // flat book: x'Hx == 0
    d.landReassess(fit(IDENTITY, [0.01, 0.01, 0.01]));

    expect(rowFor(snap(d), "AAPL").componentVar).toBeNull();
  });
});

describe("between-fit revalue", () => {
  const IDENTITY = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  const fit = (varDollars = 1000, es = 1400) => ({
    type: "reassess",
    var: varDollars,
    es,
    held_names: 3,
    corr: IDENTITY,
    sigma_forecast: [0.01, 0.01, 0.01],
    market_ts: 300,
  });

  // Three equal $5,000 longs, uncorrelated: sigma_p scales with the book, so doubling every
  // position doubles the headline. The forecast is untouched — only the exposures moved.
  function threeLongs(d, shares = 100) {
    d.applyOrder(order("AAPL", shares, 50));
    d.applyOrder(order("JPM", shares, 50));
    d.applyOrder(order("CVX", shares, 50));
  }

  it("reprices the landed forecast onto a book that has since grown", () => {
    const d = desk();
    threeLongs(d);
    d.landReassess(fit(), null, d.exposuresNow());
    threeLongs(d); // the tape fills while the next fit is still out: exposures double

    const state = snap(d);
    expect(state.risk.revalued).toBe(true);
    expect(state.risk.var).toBeCloseTo(2000, 6);
    expect(state.risk.es).toBeCloseTo(2800, 6);
  });

  it("keeps the split summing to the revalued headline", () => {
    const d = desk();
    threeLongs(d);
    d.landReassess(fit(), null, d.exposuresNow());
    d.applyOrder(order("AAPL", 400, 50)); // one name pulls away from the fit's book

    const state = snap(d);
    const total = state.rows.reduce((sum, row) => sum + row.componentVar, 0);
    expect(total).toBeCloseTo(state.risk.var, 6);
    expect(state.risk.var).toBeGreaterThan(1000);
  });

  it("reports the forecast's market age", () => {
    const d = desk();
    threeLongs(d);
    d.landReassess(fit(), null, d.exposuresNow()); // stamped at market_ts 300

    const state = d.snapshot({
      marketSeconds: 0, marketElapsed: 900, realSeconds: 0, compute: {}, done: false,
    });
    expect(state.risk.ageSeconds).toBe(600);
  });

  it("falls back to the landed figures when no exposure vector was captured", () => {
    const d = desk();
    threeLongs(d);
    d.landReassess(fit()); // an engine that supplied no book: nothing to back k out of
    threeLongs(d);

    const state = snap(d);
    expect(state.risk).toMatchObject({ var: 1000, es: 1400, revalued: false, ageSeconds: null });
  });

  it("falls back on a flat book, whose portfolio sigma is zero", () => {
    const d = desk();
    threeLongs(d);
    d.landReassess(fit(), null, d.exposuresNow());
    threeLongs(d, -100); // traded back to flat: x'Hx == 0, nothing to reprice onto

    expect(snap(d).risk).toMatchObject({ var: 1000, revalued: false });
  });
});

describe("run history", () => {
  it("keeps the newest run first and caps the tape", () => {
    const d = desk();
    for (let i = 0; i < 30; i++) d.pushHistory(i, i * 300, "computed", i);

    const state = snap(d);
    expect(state.history).toHaveLength(24);
    expect(state.history[0].index).toBe(29);
  });

  it("records dead and aborted bars without a wall-time", () => {
    const d = desk();
    d.pushHistory(0, 0, "dead");
    d.pushHistory(1, 300, "aborted");

    expect(snap(d).history.map((h) => [h.kind, h.seconds])).toEqual([
      ["aborted", null],
      ["dead", null],
    ]);
  });
});
