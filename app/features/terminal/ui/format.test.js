import { describe, expect, it } from "vitest";
import {
  corrColor,
  formatSubset,
  horizonLabel,
  marketAgo,
  marketClock,
  money,
  num,
  pct,
  scenarioLabel,
  secs,
  signedMoney,
  signedShares,
} from "./format";

// Every formatter renders an em dash for absent data rather than "NaN"/"null": the desk
// must never print a number it does not have.
describe("absent values", () => {
  const formatters = { money, signedMoney, pct, signedShares, num, secs };

  for (const [name, fn] of Object.entries(formatters)) {
    it(`${name} renders an em dash for null and NaN`, () => {
      expect(fn(null)).toBe("—");
      expect(fn(NaN)).toBe("—");
    });
  }
});

describe("money", () => {
  it("groups thousands and puts the sign outside the currency symbol", () => {
    expect(money(1234567)).toBe("$1,234,567");
    expect(money(-1234)).toBe("-$1,234");
  });

  it("honours the requested precision", () => {
    expect(money(187.238, 2)).toBe("$187.24");
  });

  it("renders zero without a sign", () => {
    expect(money(0)).toBe("$0");
  });
});

describe("signedMoney", () => {
  it("always carries an explicit sign, including at zero", () => {
    expect(signedMoney(500)).toBe("+$500");
    expect(signedMoney(-500)).toBe("-$500");
    expect(signedMoney(0)).toBe("+$0");
  });
});

describe("signedShares", () => {
  it("signs long and short and leaves a flat position unsigned", () => {
    expect(signedShares(650)).toBe("+650");
    expect(signedShares(-300)).toBe("-300");
    expect(signedShares(0)).toBe("0");
  });
});

describe("pct and num", () => {
  it("scales a fraction to a percentage", () => {
    expect(pct(0.625)).toBe("62.5%");
    expect(pct(0.625, 0)).toBe("63%");
  });

  it("pads a plain number to its requested precision", () => {
    expect(num(1.5)).toBe("1.50");
    expect(num(0.0312, 4)).toBe("0.0312");
  });
});

describe("marketClock", () => {
  it("renders session-anchored seconds as a wall clock", () => {
    expect(marketClock(9 * 3600 + 30 * 60)).toBe("09:30:00");
    expect(marketClock(16 * 3600)).toBe("16:00:00");
  });
});

describe("marketAgo", () => {
  it("names the newest sample rather than counting zero", () => {
    expect(marketAgo(0)).toBe("latest");
  });

  it("steps units as the gap grows", () => {
    expect(marketAgo(45)).toBe("45s ago");
    expect(marketAgo(600)).toBe("10 min ago");
    expect(marketAgo(3900)).toBe("1h 05m ago");
  });

  it("renders nothing without a stamp", () => {
    expect(marketAgo(null)).toBe("");
  });
});

describe("horizonLabel", () => {
  it("derives the forecast horizon from the bar interval", () => {
    expect(horizonLabel(300)).toBe("5 min-ahead");
    expect(horizonLabel(60)).toBe("1 min-ahead");
    expect(horizonLabel(90)).toBe("90 sec-ahead");
  });

  it("is unknown until a scenario lands", () => {
    expect(horizonLabel(null)).toBe("—");
  });
});

describe("scenarioLabel", () => {
  it("title-cases the payload id", () => {
    expect(scenarioLabel("crash")).toBe("Crash");
    expect(scenarioLabel(null)).toBe("");
  });
});

describe("formatSubset", () => {
  it("renders the weekday in the session's own terms, not the viewer's timezone", () => {
    expect(formatSubset({ date: "2021-10-14", session_open: "09:30", session_close: "16:00", tz: "ET" }))
      .toBe("Thu 2021-10-14 · 09:30–16:00 ET");
  });

  it("degrades to a bare date when the window is unknown", () => {
    expect(formatSubset({ date: "2021-10-14" })).toBe("Thu 2021-10-14");
    expect(formatSubset(null)).toBe("");
  });
});

describe("corrColor", () => {
  it("ramps blue at zero to red at one", () => {
    expect(corrColor(0)).toBe("rgb(37,99,235)");
    expect(corrColor(1)).toBe("rgb(220,38,38)");
  });

  it("clamps out-of-domain values instead of extrapolating the ramp", () => {
    expect(corrColor(-0.5)).toBe(corrColor(0));
    expect(corrColor(1.5)).toBe(corrColor(1));
  });
});
