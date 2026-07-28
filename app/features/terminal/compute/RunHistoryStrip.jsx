"use client";
// How long the recent fits took, as a column strip.
//
// An earlier per-row layout gave every run a full-width track that was mostly empty, so a
// list of short runs read as a stack of blank rails — the emptiness dominated whatever the
// scale denominator was. A column chart spends ink only on the bars themselves, so the
// latency trend (the thing this exists to show) is legible at a glance.
import { useMemo, useState } from "react";
import { ChartTip, sampleAge } from "../ui/charts";
import { secs } from "../ui/format";

// Only runs the model acted on reach this strip: completed fits plus the dead and aborted
// states. Skipping a stale bar is normal scheduling, so it is never recorded.
const KIND_LABEL = {
  dead: "no book — no fit run",
  aborted: "aborted — book fell under floor",
};

const DEAD_BAR_HEIGHT = "14%"; // a short hatched stub: present, visibly not a timing
const MIN_BAR_HEIGHT = 6; // percent, so the fastest run is still visible

export function RunHistoryStrip({ history }) {
  // Time runs LEFT TO RIGHT: the newest run enters at the right edge and older runs travel
  // left as the session progresses, like every other live latency monitor. The history
  // arrives newest-first, so it is reversed.
  const strip = useMemo(() => {
    const ordered = history.slice().reverse();
    const times = ordered.filter((run) => run.kind === "computed").map((run) => run.seconds);
    const sorted = times.slice().sort((a, b) => a - b);
    return {
      runs: ordered,
      stamps: ordered.map((run) => run.marketTs ?? null),
      slowest: sorted.length ? sorted[sorted.length - 1] : 0,
      median: sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0,
      last: times.length ? times[times.length - 1] : 0,
    };
  }, [history]);

  // Read through the current strip, so a pointer held while the tape advances (or a replay
  // restarts) can never index a run that has fallen off the left.
  const [hovered, setHovered] = useState(null);
  const hoveredRun = hovered == null ? null : strip.runs[hovered] ?? null;

  if (strip.runs.length === 0) {
    return <div className="terminal-panel-note">no completed runs yet</div>;
  }

  // A session acts on fewer bars than the strip has room for, so the tape never reaches
  // the left edge. The summary lives in that reserved space rather than on its own rows.
  return (
    <div className="run-spark-row">
      {strip.slowest > 0 && (
        <dl className="run-spark-stats">
          <dt>last</dt><dd>{secs(strip.last)}</dd>
          <dt>med</dt><dd>{secs(strip.median)}</dd>
          <dt>max</dt><dd>{secs(strip.slowest)}</dd>
        </dl>
      )}
      {/* The hover wrapper sits OUTSIDE the clipping strip, which drops older runs off its
          left edge and would clip the tooltip with them. */}
      <div className="run-spark-wrap chart-hover" onPointerLeave={() => setHovered(null)}>
        <div className="run-spark">
          {strip.runs.map((run, i) => (
            <span
              key={run.index}
              className={`run-spark-col kind-${run.kind} ${hovered === i ? "hovered" : ""}`}
              // Hit-testing is per COLUMN rather than by pointer geometry: the strip is
              // right-anchored and only partly filled, so an x-fraction over the whole
              // width would name the wrong run whenever the tape is short.
              onPointerEnter={() => setHovered(i)}
              // Columns are scaled to the slowest run observed — relative, because the
              // point is how latency MOVES between runs, not its absolute size.
              style={{
                height:
                  run.kind === "computed" && strip.slowest > 0
                    ? `${Math.max(MIN_BAR_HEIGHT, (run.seconds / strip.slowest) * 100)}%`
                    : DEAD_BAR_HEIGHT,
              }}
            />
          ))}
        </div>
        {/* Replaces a native tooltip, which lagged behind the pointer and could not carry
            the run's market age. Same readout as the other crosshairs, so one hover
            vocabulary covers every chart on the desk. Pinned right rather than over the
            column: the hovered column is already marked, and a 5px anchor would put the
            tip half outside the panel. */}
        {hoveredRun != null && (
          <ChartTip
            value={hoveredRun.kind === "computed" ? secs(hoveredRun.seconds) : KIND_LABEL[hoveredRun.kind]}
            age={sampleAge(strip.stamps, hovered)}
          />
        )}
      </div>
    </div>
  );
}
