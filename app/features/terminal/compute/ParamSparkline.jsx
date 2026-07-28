"use client";
// One fitted DCC parameter across landed runs.
import { Spark } from "../ui/charts";
import { num } from "../ui/format";
import { symbolize } from "../ui/symbols";

// The y-axis is FIXED per parameter, never auto-scaled to the observed range: auto-scaling
// would blow a wobble between 0.0037 and 0.0039 up to fill the panel and read as drama.
//
// But the two parameters do not share a bound. Stationarity (a + b < 1, both non-negative)
// bounds them jointly at 1, and alpha never exceeds ~0.05 anywhere, so on a shared [0,1]
// axis alpha would collapse onto the floor and say nothing. Each therefore gets its own
// axis, printed on the header line so the stacked panels are not misread as one scale.
//
// The bases are the DESK's range, re-measured against the 2026-07-27 bake (24 fits per
// scenario): alpha 0.0000-0.0028, beta 0.0000-0.2301. They were 0.06 and 1, taken from the
// five pinned BACKTEST windows — a population the desk never plays, which left both lines
// pinned to the floor at every reading. Alpha's cap is ~3.5x its observed peak and beta's
// ~1.1x, both of which the grow rule below turns into a floor rather than a ceiling.
//
// A line near the floor stays a TRUE reading — alpha really is ~0.002 here, and the
// correlation barely moves within a session because of it. Rescaling makes that line's
// SHAPE legible; it does not make the parameter larger, and the panel should not be read
// as if it had. The response the desk does show comes through the GARCH volatilities.
const DOMAIN_MAX = { "DCC α": 0.01, "DCC β": 0.25 };

// Fixed, but never a clamp: a value above the fixed top would draw as a flat line ON the
// top and hide the very excursion worth seeing. Grow to the next whole multiple of the
// base instead — the step scales with the parameter, so alpha's 0.01 axis grows to 0.02
// rather than to whatever a hardcoded step happened to suit beta.
function domainMax(label, series) {
  const base = DOMAIN_MAX[label] ?? 1;
  const peak = Math.max(...series);
  return peak <= base ? base : Math.ceil(peak / base) * base;
}

export function ParamSparkline({ label, hint, points }) {
  const series = points.map((point) => point.value);
  const stamps = points.map((point) => point.marketTs ?? null);
  const current = series.length ? series[series.length - 1] : null;
  const top = series.length ? domainMax(label, series) : 1;

  const header = (
    <div className="param-spark-head">
      <span className="param-spark-label">
        {symbolize(label)}
        {/* The plain-language gloss AND the axis range. The two parameters are drawn on
            different scales, so unlabelled the stacked panels read as one axis and alpha's
            motion as beta-sized. The range lives on this line rather than as ticks over
            the plot, which is 28px tall and would collide with the line it annotates. */}
        {hint && <span className="param-spark-hint"> {hint} · 0–{top < 1 ? top.toFixed(2) : "1"}</span>}
      </span>
      <span className="param-spark-val">{current == null ? "—" : num(current, 4)}</span>
    </div>
  );
  // A single point is not a trend, so `Spark` draws nothing until there is a second
  // reading; the value itself is already in the header.
  return (
    <div className="param-spark">
      {header}
      <Spark series={series} stamps={stamps} top={top} format={(v) => num(v, 4)} />
    </div>
  );
}
