"use client";
// The desk's left rail: what data is loaded, which regime is selected, what the model is.
// Only the scenario list is interactive; the rest are captions.
import { formatSubset, scenarioLabel } from "../ui/format";

/**
 * @param flashScenario marks the scenario list while the onboarding gate is up. The gate
 *   tells the reader they may pick a regime before starting, and without the marker that
 *   line points at a control the eye has not found yet. The gesture is timed in CSS; the
 *   class is dropped the moment the list is used or the run starts.
 * @param gated lifts the rail above the onboarding backdrop, so the desk is blocked while
 *   the one control the gate points at stays lit and usable.
 */
export function Sidebar({ scenario, scenarios, onSelect, horizon, subset, flashScenario, gated }) {
  return (
    <aside className={`terminal-sidebar ${gated ? "gated" : ""}`}>
      <div className="terminal-section">
        <div className="terminal-section-title">Sample</div>
        {/* Two deliberate lines: the underlying data is Dow Jones constituents sampled on
            5-minute bars. Splitting the sampling onto a muted caption keeps the 240px
            column from breaking "5-min" mid-token. */}
        <ul className="terminal-menu">
          <li>
            <button disabled>
              Dow Jones constituents
              <span className="terminal-menu-sub terminal-menu-sub--muted">5-min bars</span>
            </button>
          </li>
        </ul>
      </div>

      <div className={`terminal-section ${flashScenario ? "flash-attention" : ""}`}>
        <div className="terminal-section-title">Scenario</div>
        <ul className="terminal-menu">
          {scenarios.map((entry) => {
            const selected = entry.id === scenario;
            return (
              <li key={entry.id}>
                <button className={selected ? "active" : ""} onClick={() => onSelect(entry.id)}>
                  {scenarioLabel(entry.id)}
                  {/* The window shows only on the selected scenario. The span renders even
                      when the window is not known yet, holding a non-breaking space: the
                      manifest normally supplies it before first paint, and reserving the
                      line means the row cannot change height if it does not. */}
                  {selected && (
                    <span className="terminal-menu-sub">
                      {subset ? formatSubset(subset) : " "}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="terminal-section">
        <div className="terminal-section-title">Model</div>
        <ul className="terminal-menu">
          <li><button disabled>GARCH(1,1)-t marginals</button></li>
          <li><button disabled>Gaussian copula</button></li>
          <li><button disabled>Engle (2002) DCC</button></li>
          <li><button disabled>MC VaR · 95% · {horizon}</button></li>
        </ul>
      </div>
    </aside>
  );
}
