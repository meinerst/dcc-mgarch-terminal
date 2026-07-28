"use client";
// Shared hover behaviour for every time-series chart on the desk (α, β, ρ, run
// durations), so all four read identically: the pointer's x picks the nearest sample, the
// chart rules a line through it, and the tooltip names that sample's market age.
//
// Charts are drawn in a 0..100 viewBox with preserveAspectRatio="none", so a sample's
// index fraction IS its x in both viewBox units and container percent — nothing needs
// measuring beyond the pointer itself.
import { useState } from "react";
import { marketAgo } from "./format";

export function useCrosshair(count) {
  const [hover, setHover] = useState(null);
  const handlers = {
    onPointerMove: (e) => {
      const rect = e.currentTarget.getBoundingClientRect();
      if (!rect.width || count < 2) return;
      const fraction = (e.clientX - rect.left) / rect.width;
      setHover(Math.max(0, Math.min(count - 1, Math.round(fraction * (count - 1)))));
    },
    onPointerLeave: () => setHover(null),
  };
  // Clamped on READ: the series grows (and resets on replay) under a held pointer, so a
  // stored index can outlive the array it indexed.
  return [hover == null || count < 2 ? null : Math.min(hover, count - 1), handlers];
}

/**
 * Market age of sample `i` relative to the newest one. Landed fits carry their own
 * stamps because they are not evenly spaced (reassessment stride, skipped stale bars);
 * without stamps the honest fallback counts runs rather than minutes.
 */
export function sampleAge(stamps, index) {
  const last = stamps[stamps.length - 1];
  if (last == null || stamps[index] == null) {
    const back = stamps.length - 1 - index;
    return back === 0 ? "latest" : `${back} run${back === 1 ? "" : "s"} back`;
  }
  return marketAgo(last - stamps[index]);
}

/**
 * Tooltip for the hovered sample: the value, then its age. `xPct` centres it over the
 * point and is clamped to the panel — at the ends of a series an unclamped tip would hang
 * outside the desk's narrow right column. Omit `xPct` to pin it to the right edge instead
 * (the run strip, whose 5px columns are too narrow to anchor a tip to).
 */
export function ChartTip({ xPct, value, age }) {
  const pinned = xPct == null;
  return (
    <div
      className={`chart-tip ${pinned ? "pin-right" : ""}`}
      style={pinned ? undefined : { left: `${Math.max(8, Math.min(92, xPct))}%` }}
    >
      <span className="chart-tip-val">{value}</span>
      <span className="chart-tip-age">{age}</span>
    </div>
  );
}

/** Sample index -> x in the shared 0..100 viewBox. */
export function chartXs(count, width = 100) {
  return Array.from({ length: count }, (_, i) => (i / (count - 1)) * width);
}

/** An SVG path through `ys` at `xs`. */
export function linePath(xs, ys) {
  return xs.map((x, i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ");
}

/**
 * The desk's one-line chart: `series` drawn against a FIXED `top`, with the shared
 * crosshair and age tip. The header above it belongs to the caller — a DCC panel names a
 * parameter and its axis, a metric card names a unit — but the plot itself is one
 * component so the two never drift into reading differently.
 *
 * Fewer than two points draws nothing: a single reading is not a trend, and a placeholder
 * would reserve dead space for one run.
 */
export function Spark({ series, stamps = [], top, format, svgHeight = 28 }) {
  const [hover, hoverHandlers] = useCrosshair(series.length);
  if (series.length < 2) return null;

  const width = 100;
  const height = 20;
  const xs = chartXs(series.length, width);
  const ys = series.map((v) => height - (Math.max(0, Math.min(top, v)) / top) * height);

  return (
    <div className="chart-hover" {...hoverHandlers}>
      <svg
        className="param-spark-svg"
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={svgHeight}
        preserveAspectRatio="none"
      >
        <line x1="0" y1={height} x2={width} y2={height} stroke="var(--color-terminal-border)" strokeWidth="0.5" />
        <path d={linePath(xs, ys)} fill="none" stroke="var(--color-terminal-blue)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        {hover != null && (
          <>
            <line className="chart-crosshair" x1={xs[hover]} x2={xs[hover]} y1="0" y2={height} vectorEffect="non-scaling-stroke" />
            <circle cx={xs[hover]} cy={ys[hover]} r="2" fill="var(--color-terminal-blue)" />
          </>
        )}
        <circle cx={xs[xs.length - 1]} cy={ys[ys.length - 1]} r="1.6" fill="var(--color-terminal-blue)" />
      </svg>
      {hover != null && (
        <ChartTip xPct={xs[hover]} value={format(series[hover])} age={sampleAge(stamps, hover)} />
      )}
    </div>
  );
}
