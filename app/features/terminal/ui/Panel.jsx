"use client";
// The desk's frame. Every panel on the terminal is one of these, so the two states a
// panel can be in are decided once, here.
import { InfoTip } from "./InfoTip";

// Shown wherever a risk figure would otherwise be: no landed fit has priced enough
// names yet. A display floor, not a model requirement.
export const AWAITING_RISK = "AWAITING FIRST RISK SNAPSHOT";

/**
 * @param inert  the risk floor has not been crossed, so the panel is visibly dead
 * @param model  this panel shows MODEL OUTPUT (estimated, can be wrong) rather than book
 *               arithmetic (always true). Purely presentational provenance — a tinted
 *               header, explained once in the footer legend rather than on every panel.
 *               Chrome only: no value inside is recoloured, which keeps the tint off the
 *               green/red/amber status axis.
 */
export function Panel({ title, note, tip, inert, model, children }) {
  return (
    <div className={`terminal-panel ${model ? "model" : ""} ${inert ? "inert" : ""}`}>
      <div className="terminal-panel-header">
        <div className="terminal-panel-title">
          {title}
          {tip && <InfoTip text={tip} />}
        </div>
        {inert ? <div className="panel-inert-label">{AWAITING_RISK}</div>
               : note && <div className="terminal-panel-note">{note}</div>}
      </div>
      <div className="terminal-panel-content">{children}</div>
    </div>
  );
}
