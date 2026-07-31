"use client";
// What the fit the compute clock just timed actually produced.
//
// These sit inside the compute panel rather than in one of their own: they are the OUTPUT
// of the stages the clock times, and splitting them into a separate panel told one story
// across two rows of the desk.
import { Stat } from "../ui/Stat";
import { num } from "../ui/format";
import { ParamSparkline } from "./ParamSparkline";

export function FitDiagnostics({ latest, riskLive, dccSeries }) {
  const dcc = riskLive ? latest?.dcc : null;
  const alphaSeries = dccSeries.map((point) => ({ value: point.a, marketTs: point.marketTs }));
  const betaSeries = dccSeries.map((point) => ({ value: point.b, marketTs: point.marketTs }));

  return (
    <div className={riskLive ? "" : "diagnostics-inert"}>
      <div className="diagnostics-stats">
        <Stat label="DCC α" value={dcc ? num(dcc.a, 4) : "—"} />
        <Stat label="DCC β" value={dcc ? num(dcc.b, 4) : "—"} />
        {/* The only tipped stat: alpha and beta are what a reader expects a DCC fit to
            report, but a lone "Student-t ν" reads as a fitted JOINT degrees of freedom,
            which it is not — hence the payload key it reads, and the tip. */}
        <Stat
          label="Student-t ν"
          value={dcc ? num(dcc.nu_marginal_avg, 2) : "—"}
          tip={"How fat the return tails are across the book. Lower = fatter tails = bigger extreme moves expected.\nOne Student-t dof per name, averaged by absolute exposure.\nNot a joint-t parameter — the copula is Gaussian, so this reads the individual tails only."}
        />
      </div>
      {/* The gloss is a FOOTNOTE rather than part of the label: inline it wrapped to four
          lines inside a ~100px column and dropped that stat's value a row below its two
          neighbours. Full-width here, so all three sit on one baseline. */}
      <div className="diagnostics-note">
        <span className="sym">ν</span> · marginal ν, exposure-weighted mean
      </div>
      <div className="diagnostics-status">
        {latest == null ? (
          <span className="terminal-status-badge">awaiting first run</span>
        ) : latest.degraded ? (
          <span className="terminal-status-badge warn">degraded · constant-correlation fallback</span>
        ) : (
          <span className="terminal-status-badge success">converged</span>
        )}
      </div>
      {/* How the two fitted parameters MOVE across runs — the stat row above only ever
          shows the latest. Separate charts rather than one overlay: alpha (shock response)
          and beta (memory) are different quantities, so a shared axis would read as a
          comparison rather than as two series. */}
      <div className="param-spark-stack">
        <ParamSparkline label="DCC α" hint="shock" points={alphaSeries} />
        <ParamSparkline label="DCC β" hint="memory" points={betaSeries} />
      </div>
    </div>
  );
}
