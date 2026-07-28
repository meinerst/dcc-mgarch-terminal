import { describe, expect, it } from "vitest";
import { eulerRiskSplit } from "./riskDecomposition";

// One consistent two-name forecast reused across the cases, so a changed expectation is
// always about the maths and never about a differently shaped input.
const UNIVERSE = ["AAPL", "JPM"];
const SIGMA = [0.02, 0.01];
const CORR = [
  [1, 0.5],
  [0.5, 1],
];
const PORTFOLIO_VAR = 300;

function split(exposures, overrides = {}) {
  return eulerRiskSplit({
    universe: UNIVERSE,
    exposures,
    sigma: SIGMA,
    corr: CORR,
    portfolioVar: PORTFOLIO_VAR,
    ...overrides,
  });
}

describe("eulerRiskSplit", () => {
  it("splits the headline VaR with no residual", () => {
    const { componentVar } = split([1000, -500]);

    expect(componentVar[0] + componentVar[1]).toBeCloseTo(PORTFOLIO_VAR, 10);
    expect(componentVar[0]).toBeCloseTo(323.0769, 4);
    expect(componentVar[1]).toBeCloseTo(-23.0769, 4);
  });

  it("gives a hedging name a negative contribution and a diversification above one", () => {
    const { componentVar, divEffect } = split([1000, -500]);

    expect(componentVar[1]).toBeLessThan(0);
    expect(divEffect[1]).toBeGreaterThan(1);
    expect(divEffect[1]).toBeCloseTo(1.27735, 4);
  });

  it("gives a name that moves with the book a diversification near zero", () => {
    const { divEffect } = split([1000, 500]);

    expect(divEffect[0]).toBeGreaterThan(0);
    expect(divEffect[0]).toBeLessThan(0.2);
  });

  it("reports the whole VaR and zero diversification for a one-name book", () => {
    const only = eulerRiskSplit({
      universe: ["AAPL"],
      exposures: [1000],
      sigma: [0.02],
      corr: [[1]],
      portfolioVar: PORTFOLIO_VAR,
    });

    expect(only.componentVar[0]).toBeCloseTo(PORTFOLIO_VAR, 10);
    expect(only.divEffect[0]).toBeCloseTo(0, 10); // a book of one is perfectly itself
  });

  it("is homogeneous of degree one: scaling the book scales no share", () => {
    const small = split([1000, -500]);
    const large = split([3000, -1500]);

    expect(large.componentVar[0]).toBeCloseTo(small.componentVar[0], 10);
    expect(large.divEffect[1]).toBeCloseTo(small.divEffect[1], 10);
  });

  it("scales the components with the headline VaR", () => {
    const base = split([1000, -500]);
    const doubled = split([1000, -500], { portfolioVar: 2 * PORTFOLIO_VAR });

    expect(doubled.componentVar[0]).toBeCloseTo(2 * base.componentVar[0], 10);
    expect(doubled.divEffect[0]).toBeCloseTo(base.divEffect[0], 10); // a share, not a level
  });

  it("leaves a flat name absent rather than reporting it as uncorrelated", () => {
    const { componentVar, divEffect } = split([1000, 0]);

    expect(componentVar[1]).toBe(0);
    expect(divEffect[1]).toBeNull();
  });

  it("skips a name the model gave no volatility", () => {
    const { divEffect } = split([1000, 500], { sigma: [0.02, 0] });

    expect(divEffect[1]).toBeNull();
  });

  it("refuses to split a book that carries no risk", () => {
    expect(split([0, 0])).toBeNull();
  });

  it("refuses to split without a forecast", () => {
    expect(split([1000, -500], { sigma: null })).toBeNull();
    expect(split([1000, -500], { corr: null })).toBeNull();
    expect(split([1000, -500], { portfolioVar: null })).toBeNull();
  });

  it("refuses to split a non-finite forecast rather than emitting NaN rows", () => {
    expect(split([1000, -500], { sigma: [Number.NaN, 0.01] })).toBeNull();
  });
});
