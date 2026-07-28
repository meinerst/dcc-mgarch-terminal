"use client";
// Fires once when the session plays out. Plain, matching the desk — no animation, no blur.
// RESTART re-runs the current scenario through the same path a scenario switch uses.
import { scenarioLabel } from "../ui/format";

export function EndOfRunModal({ scenario, onClose, onRestart }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-box">
        <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        <div className="modal-title">SESSION COMPLETE</div>
        <div className="modal-body">
          The <strong>{scenarioLabel(scenario)}</strong> demo has played to its close. Every
          risk reassessment ran on CPU at the wall-time shown on the compute clock; the
          market clock was the only accelerated axis.
        </div>
        <div className="modal-actions">
          <button className="modal-action" onClick={onRestart}>RESTART</button>
        </div>
      </div>
    </div>
  );
}
