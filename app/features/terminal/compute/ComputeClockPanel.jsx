"use client";
// The compute clock: real wall-clock seconds per model fit, never accelerated.
import { Panel } from "../ui/Panel";
import { secs } from "../ui/format";
import { FitDiagnostics } from "./FitDiagnostics";
import { RunHistoryStrip } from "./RunHistoryStrip";

function statusLine(compute, minNamesForRisk) {
  if (compute.done) return "sequence complete";
  if (compute.dead) return `book < ${minNamesForRisk} securities — no fit run`;
  if (compute.landed) return "run complete";
  if (compute.idle) return "waiting for next bar";
  return "computing…";
}

// A run that outlives its estimate is the exhibit, not an error: optimization slows down
// exactly when volatility rises. Say so rather than counting down past zero.
function remainingLine(compute) {
  if (compute.done) return "—";
  if (compute.landed) return `landed · ${secs(compute.elapsed)}`;
  if (compute.idle) return `next bar in ~${secs(compute.waitSeconds)}`;
  if (compute.elapsed > compute.target) {
    return `reassessing · ${secs(compute.elapsed - compute.target)} over estimate`;
  }
  return `reassessing · ${secs(compute.target - compute.elapsed)} left`;
}

export function ComputeClockPanel({
  compute, history, dccSeries = [], latest, riskLive, cpu, minNamesForRisk,
}) {
  return (
    <Panel
      title="Risk Reassessment"
      note="compute clock"
      model
      tip="Real Python wall-time for one reassessment, unaccelerated. The market clock above is compressed by the replay factor; this one never is."
    >
      <div className="compute-clock">
        <div className={`compute-bar-track ${compute.idle ? "idle" : ""}`}>
          <div
            // Full-and-green is keyed to a LANDED fit, never to the fill reaching the end
            // of its estimate: an overrunning run stays blue and short of full.
            className={`compute-bar-fill ${compute.landed || compute.done ? "done" : ""}`}
            // Redrawn every frame off the engine's own clock, so the width IS the
            // animation — see the no-transition note in terminal.css.
            style={{ width: `${compute.progress * 100}%` }}
          />
        </div>
        <div className="compute-clock-caption">
          <span>{statusLine(compute, minNamesForRisk)}</span>
          <span className="compute-clock-seconds">{secs(compute.elapsed)}</span>
        </div>
        {/* Run status on its own line, the machine that ran it on the next. The chip sits
            here rather than in the panel header — a full chip name wrapped the header onto
            two lines — and it belongs beside the wall-time it qualifies, since the seconds
            above are only meaningful given the machine. "1 thread" is the honest count, not
            the marketing core count: the pipeline is Python under the GIL, so the
            Monte-Carlo and GARCH optimizer loops are single-thread bound and only BLAS
            calls spill wider.

            Status and chip shared ONE row until the desk's model column got narrow enough
            that neither fit: side by side, "reassessing · 3.6s left" and a full chip name
            each lost their tail to an ellipsis, and the two facts a reader is here for —
            how long is left, and what hardware that time is measured on — were both
            unreadable at once. Stacked, each gets the full column width and neither
            truncates on any chip name short of absurd. */}
        <div className="compute-clock-meta">{remainingLine(compute)}</div>
        {cpu && (
          <div className="compute-clock-meta compute-clock-cpu" title={`${cpu} · single-threaded`}>
            {cpu} · 1 thread
          </div>
        )}

        <div className="panel-subhead">Run-duration history</div>
        <RunHistoryStrip history={history} />

        <div className="panel-subhead">Diagnostics</div>
        <FitDiagnostics latest={latest} riskLive={riskLive} dccSeries={dccSeries} />
      </div>
    </Panel>
  );
}
