"use client";
// Onboarding surfaces for the terminal: the cold-start gate, the explainer, and the
// skeleton desk that sits behind them.
//
// The run does NOT auto-play; TerminalDesk gates the load effect. That is the premise
// here: a visitor arriving cold gets a choice before a single byte is fetched or a single
// fit runs, rather than landing mid-session with no idea what is moving. Three surfaces,
// in the order a first-time reader meets them:
//
//   GateBox        small box: START (+ EXPLAIN on a first visit)
//   ExplainerModal the long form, opened from EXPLAIN or from the permanent ⓘ
//   SkeletonDesk   the empty desk frame both of them sit over
//
// Separate from the panels on purpose: they render RUN STATE, these render the absence
// of it. Nothing in this file reads a snapshot.
import { scenarioLabel } from "../ui/format";

// One line per card, worded with the card's own on-screen title so the eye can map the
// bullet to the thing. Order follows the desk's reading order: headline row, then the book
// column (left), then the model column (right).
const DESK_CARDS = [
  ["Gross Exposure · VaR · Expected Shortfall",
   "the headline row: how big the book is, the loss the next 5-minute bar exceeds 5% of the time, and the average loss beyond that threshold."],
  ["Portfolio Positions",
   "every name the desk has traded: shares, average entry, and P&L split into inventory, spread and total."],
  ["Correlation Dynamics",
   "the fitted correlation matrix as it moves. Click a cell or a row to re-reference it."],
  ["Order Flow",
   "the raw tape: which name, which side, what size, as each order lands."],
  ["Risk Reassessment",
   "the compute clock: real wall-clock seconds each model fit took, plus the history of the fits behind it."],
  ["VaR Decomposition",
   "splits the headline VaR across the positions that cause it. Negative means the position hedges the book."],
];

// The explainer's one action button changes with where it was opened from — there is
// always exactly one obvious thing to do next, and it is never "go find another control".
// Same dead-end lesson the end-of-run modal's RESTART already learned.
//
// CLOSE is the case where the run was ALREADY paused when the explainer opened: closing
// leaves it paused, so promising RESUME would be a lie the button cannot keep. It is also
// the only label here that does not advance the run, hence the only one not painted green.
const ACTION_LABEL = { start: "START", resume: "RESUME", restart: "RESTART", close: "CLOSE" };

export function ExplainerModal({ scenario, action, onAction, onClose }) {
  return (
    <div className="modal-backdrop desk-backdrop" role="dialog" aria-modal="true" aria-label="About this simulation">
      <div className="modal-box wide">
        <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        <div className="modal-title">About this simulation</div>
        <div className="modal-body">
          <p>
            A market-making desk quoting 30 Dow Jones constituents, running a
            DCC-MGARCH risk model against its own book in real time.
          </p>
          <p>
            <strong>Two clocks, and only one of them is compressed.</strong> Prices are real
            5-minute bars, replayed at a multiple of real time so a full session fits in
            minutes. That is the market clock, and it is labelled everywhere it appears.
            The compute clock is not accelerated: those are real measured wall-clock seconds
            from an actual run of the model on CPU, recorded and replayed here at true
            speed. A fit that took nine seconds takes nine seconds.
          </p>
          <p>
            <strong>The book moves on its own.</strong> Simulated orders arrive continuously
            and the desk quotes both sides, earning half of a 0.1% bid-ask spread on every
            fill. Positions therefore change constantly, and the model refits against the
            book as it actually is — so the risk numbers update themselves rather than
            being set once. Note that spread income is riskless and only ever accrues: in
            the crash window you will see it tick up while inventory P&L changes notably.
          </p>
          <p className="modal-subhead">What each card shows</p>
          <ul className="modal-list">
            {DESK_CARDS.map(([label, text]) => (
              <li key={label}><strong>{label}</strong> — {text}</li>
            ))}
          </ul>
          <p className="modal-subhead">Two scenarios, on the left</p>
          <ul className="modal-list">
            <li><strong>Calm</strong> — an ordinary session. The model converges cleanly and
              the correlation matrix drifts.</li>
            <li><strong>Crash</strong> — March 2020. This is the window where the original
              2022 thesis pipeline failed outright; the corrected one holds.</li>
          </ul>
        </div>
        <div className="modal-actions">
          <button
            className={`modal-action${action === "close" ? "" : " primary"}`}
            onClick={onAction}
          >
            {ACTION_LABEL[action]}
            {action === "start" && ` ${scenarioLabel(scenario).toUpperCase()}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// The cold-start gate. Its job is to say what the reader is about to watch and get out of
// the way — the detail belongs in the explainer, one click behind it. `seen` drops the
// EXPLAIN button only: once a reader has been through the door in this session the second
// button is noise, and the ⓘ in the clock bar keeps the explainer reachable regardless.
export function GateBox({ scenario, seen, onStart, onExplain, onClose }) {
  return (
    <div className="modal-backdrop gate-backdrop" role="dialog" aria-modal="true" aria-label="Start the simulation">
      <div className="modal-box gate">
        <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        {/* No scenario in the title: the sidebar already shows which one is selected, the
            explainer names both, and the hint line below points at the choice. */}
        <div className="modal-title">Live demo</div>
        <div className="modal-body">
          <p>
            <strong>See the model work.</strong> A DCC-MGARCH risk engine running against a
            market-making book: real 5-minute Dow bars, orders landing throughout, and
            correlations and VaR refit as the book moves under them.
          </p>
          {/* Names the CURRENT selection, not a hard-coded "calm": once the reader has
              taken the hint and picked crash, the line would otherwise contradict them. */}
          <p className="gate-hint">
            Pick a market regime on the left — or start with{" "}
            <strong>{scenarioLabel(scenario).toLowerCase()}</strong>.
          </p>
        </div>
        <div className="modal-actions">
          {!seen && (
            <button className="modal-action" onClick={onExplain}>EXPLAIN</button>
          )}
          <button className="modal-action primary" onClick={onStart}>▶ START</button>
        </div>
      </div>
    </div>
  );
}

// The desk frame with nothing in it. Deliberately NOT the real panels fed empty props:
// those render run state and would have to grow null branches they otherwise never need,
// for a view that is dimmed behind a backdrop anyway. This is the layout, and nothing else.
function SkeletonPanel({ title }) {
  return (
    <div className="terminal-panel skeleton">
      <div className="terminal-panel-header">
        <div className="terminal-panel-title">{title}</div>
      </div>
      <div className="terminal-panel-content"><span className="skeleton-dash">—</span></div>
    </div>
  );
}

export function SkeletonDesk() {
  return (
    <>
      <div className="terminal-grid-3col" style={{ marginBottom: 16 }}>
        {/* The same three labels the live cards carry — the horizon is not among them, so
            the skeleton no longer needs it either. */}
        {["Gross Exposure", "VaR · 95%", "Expected Shortfall · 95%"].map((label) => (
          <div key={label} className="terminal-metric-card skeleton">
            <div className="terminal-metric-label">{label}</div>
            <div className="terminal-metric-value">—</div>
          </div>
        ))}
      </div>
      <div className="terminal-desk">
        <div>
          <SkeletonPanel title="Portfolio Positions" />
          <SkeletonPanel title="Correlation Dynamics" />
          <SkeletonPanel title="Order Flow" />
        </div>
        <div className="desk-col-model">
          <SkeletonPanel title="Risk Reassessment" />
          <SkeletonPanel title="VaR Decomposition" />
        </div>
      </div>
    </>
  );
}
