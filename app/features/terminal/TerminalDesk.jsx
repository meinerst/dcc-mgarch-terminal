"use client";
// The desk's composition and lifecycle: load a session, drive a playback engine, lay the
// panels out. It holds no model logic and no book arithmetic — the engines own scheduling,
// the book owns accounting, and the panels only render the snapshot they are handed.
import { useEffect, useRef, useState } from "react";
import {
  isLiveMode, loadLiveBar, loadLiveSession, loadManifest, loadScenario,
} from "./compute/datasource";
import { createPlayback } from "./compute/cannedPlayback";
import { createLivePlayback } from "./compute/livePlayback";
import { ComputeClockPanel } from "./compute/ComputeClockPanel";
import { OrderFlowPanel } from "./orderflow/OrderFlowPanel";
import { PositionsPanel } from "./positions/PositionsPanel";
import { CorrelationPanel } from "./model/CorrelationPanel";
import { DegradedBanner } from "./model/DegradedBanner";
import { MetricCards } from "./model/MetricCards";
import { VarDecompositionPanel } from "./model/VarDecompositionPanel";
import { MarketClockBar } from "./shell/MarketClockBar";
import { Sidebar } from "./shell/Sidebar";
import { EndOfRunModal } from "./shell/EndOfRunModal";
import { ExplainerModal, GateBox, SkeletonDesk } from "./shell/Onboarding";
import { useStackedDesk } from "./shell/useStackedDesk";
import { horizonLabel } from "./ui/format";

const INITIAL_SCENARIO = "calm";
const FALLBACK_SCENARIOS = [{ id: "calm" }, { id: "crash" }];

// "Has this reader already been offered the explainer?" — sessionStorage, so it dies with
// the tab. Someone returning days later is usually a fresh audience and gets the offer
// again; someone tabbing back and forth within one sitting does not.
const SEEN_KEY = "dccmgarch.terminal.onboarded";

export function TerminalDesk() {
  const [scenarios, setScenarios] = useState(FALLBACK_SCENARIOS);
  const [scenario, setScenario] = useState(INITIAL_SCENARIO);
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);
  const [selectedTicker, setSelectedTicker] = useState(null);
  // Where the selection came from: a table row or a correlation cell. The matrix only
  // reorders on a row selection, so a cell click highlights the tables without making the
  // clicked cell jump out from under the pointer.
  const [selectionSource, setSelectionSource] = useState("row");
  const [paused, setPaused] = useState(false);
  // Bumping this re-enters the same load effect a scenario switch uses, so RESTART is the
  // existing path rather than a second lifecycle.
  const [runId, setRunId] = useState(0);
  const [modalDismissed, setModalDismissed] = useState(false);
  const playbackRef = useRef(null);
  // Stacked, the desk is a long scroll and the tape moves to the top of it — see the
  // placement note at the render below.
  const stacked = useStackedDesk();

  // `started` gates the ENTIRE run, not just the clock: until it flips, the load effect
  // returns before fetching, so nothing is pulled and — in live mode — no session is
  // opened and no fit is put on a CPU for a visitor who may never press play. It arms on
  // FIRST MOUNT only: a scenario switch and RESTART are already explicit "run it" clicks
  // and would read as broken if they landed on a second start button.
  const [started, setStarted] = useState(false);
  const [gateOpen, setGateOpen] = useState(true);
  const [explainerOpen, setExplainerOpen] = useState(false);
  const [seenExplainer, setSeenExplainer] = useState(false);
  const [flashScenario, setFlashScenario] = useState(true);
  // Distinguishes "paused because the explainer opened" from "the reader pressed PAUSE".
  // A ref, not state: closing the explainer must read the value in the same tick it clears it.
  const pausedByExplainerRef = useRef(false);

  // Read on mount rather than in the initializer: sessionStorage does not exist during the
  // static prerender, and reading it in useState would desync hydration.
  useEffect(() => {
    try {
      if (sessionStorage.getItem(SEEN_KEY)) setSeenExplainer(true);
    } catch { /* storage blocked — treat as a first visit, the safe default */ }
  }, []);

  function markSeen() {
    setSeenExplainer(true);
    try { sessionStorage.setItem(SEEN_KEY, "1"); } catch { /* non-fatal */ }
  }

  function selectTicker(ticker, source = "row") {
    setSelectedTicker(ticker);
    setSelectionSource(source);
  }

  // The scenario list, best-effort. Manifest entries carry each session's window, so the
  // rail can print the date before START — the run's own payload is not fetched until
  // then, and waiting for it made the menu row grow a line the moment the demo began.
  useEffect(() => {
    loadManifest()
      .then((manifest) =>
        setScenarios(manifest.scenarios.map((s) => ({ id: s.id, subset: s.subset ?? null })))
      )
      .catch(() => {});
  }, []);

  // (Re)start playback whenever the scenario or the run changes. Live drives the streaming
  // engine (session meta once, then per-bar fits on demand); canned replays a recording.
  // Same panels either way, because both engines share one book.
  useEffect(() => {
    if (!started) return;
    let cancelled = false;
    setState(null);
    setError(null);
    setSelectedTicker(null); // the universe differs per scenario
    setSelectionSource("row");
    setPaused(false);
    setModalDismissed(false);
    if (playbackRef.current) playbackRef.current.stop();

    async function begin() {
      try {
        let playback;
        if (isLiveMode) {
          const meta = await loadLiveSession(scenario);
          if (cancelled) return;
          // Thread the session's echoed seed through every bar fetch so the stateless
          // server reproduces this session's exact tape.
          const sessionParams = { seed: String(meta.seed) };
          const fetchBar = (ordinal, overrides) =>
            loadLiveBar(scenario, ordinal, { ...sessionParams, ...overrides });
          playback = createLivePlayback(meta, fetchBar, setState);
        } else {
          const payload = await loadScenario(scenario);
          if (cancelled) return;
          playback = createPlayback(payload, setState);
        }
        if (cancelled) return;
        playbackRef.current = playback;
        playback.start();
      } catch (e) {
        if (!cancelled) setError(e.message);
      }
    }
    begin();

    return () => {
      cancelled = true;
      if (playbackRef.current) playbackRef.current.stop();
    };
  }, [scenario, runId, started]);

  const degraded = !!state?.latest?.degraded;
  const horizon = horizonLabel(state?.secPerBar);

  // The engine call stays OUT of the state updater: React invokes updaters twice under
  // StrictMode, so a side effect inside one fires twice per click. It also uses
  // pause/resume, never stop/start — stop is teardown and strands the fit on the CPU,
  // which is not what a pause button means.
  function togglePause() {
    const playback = playbackRef.current;
    if (!playback) return;
    const next = !paused;
    if (next) playback.pause();
    else playback.resume();
    setPaused(next);
  }

  // One restart path, shared by the end-of-run modal and the clock bar's RESTART.
  function restartRun() {
    setModalDismissed(true);
    setExplainerOpen(false);
    pausedByExplainerRef.current = false;
    setRunId((n) => n + 1);
  }

  // One start path: the gate, the explainer and the clock bar all land here. Flipping
  // `started` is what releases the load effect.
  function startRun() {
    markSeen();
    setFlashScenario(false);
    setGateOpen(false);
    setExplainerOpen(false);
    setStarted(true);
  }

  // The explainer describes the desk, so the desk must hold still while it is read —
  // otherwise the example just described has scrolled past by the time it closes (and in
  // live mode the CPU keeps grinding fits nobody is watching). A reader who had already
  // pressed PAUSE stays paused on close; only our own pause is undone.
  function openExplainer() {
    if (started && !paused && !state?.done && playbackRef.current) {
      playbackRef.current.pause();
      setPaused(true);
      pausedByExplainerRef.current = true;
    }
    setExplainerOpen(true);
  }

  function closeExplainer() {
    setExplainerOpen(false);
    markSeen();
    if (pausedByExplainerRef.current) {
      pausedByExplainerRef.current = false;
      playbackRef.current?.resume();
      setPaused(false);
    }
    // Closing the explainer before starting falls back to the gate rather than to an empty
    // desk — the reader has still not chosen anything.
    if (!started) setGateOpen(true);
  }

  // The explainer's single action follows the run's state, so there is always exactly one
  // sensible next move and it is never "close this and find another button". The last two
  // branches are the same handler and differ only in what they can honestly promise: only
  // a pause WE took gets undone on close, so a reader who had already pressed PAUSE is
  // offered CLOSE. Reading the ref during render is sound here because `openExplainer`
  // writes it before the state update that mounts this modal.
  const explainerAction = !started
    ? "start"
    : state?.done
      ? "restart"
      : pausedByExplainerRef.current
        ? "resume"
        : "close";
  const explainerActions = {
    start: startRun, restart: restartRun, resume: closeExplainer, close: closeExplainer,
  };

  function selectScenario(id) {
    setFlashScenario(false); // the cue has done its job the moment the list is used
    setScenario(id);
  }

  // The gate raises the rail ABOVE its backdrop, so the desk is blocked but the scenario
  // list the gate points at stays lit and clickable.
  const gated = !started && (gateOpen || explainerOpen);

  // The ⓘ is the way BACK to the explainer, so it only earns its place once onboarding is
  // behind the reader — while the gate is up it duplicates that box's own EXPLAIN, and
  // behind the explainer it points at what is already open. Every exit restores it: START
  // arms `started`, ✕ clears `gateOpen`, and closing the explainer pre-start falls back to
  // the gate, which hides it again.
  const onboardingPassed = started || (!gateOpen && !explainerOpen);

  // The running payload's own window if there is one, otherwise the manifest's — identical
  // values, but the manifest's exists before START and survives the gap while a switched
  // scenario loads, so the menu row never gains or loses its second line mid-run.
  const shownSubset =
    state?.subset ?? scenarios.find((s) => s.id === scenario)?.subset ?? null;

  return (
    <div className="terminal-shell">
      <Sidebar
        scenario={scenario}
        scenarios={scenarios}
        onSelect={selectScenario}
        horizon={horizon}
        subset={shownSubset}
        flashScenario={!started && flashScenario}
        gated={gated}
      />
      <div className="terminal-main">
        <MarketClockBar
          marketSeconds={state?.marketSeconds ?? 0}
          replayFactor={state?.replayFactor ?? 25}
          degraded={degraded}
          paused={paused}
          onTogglePause={togglePause}
          done={!!state?.done}
          onRestart={restartRun}
          started={started}
          onStart={startRun}
          onOpenExplainer={onboardingPassed ? openExplainer : null}
        />
        {/* The canvas is the desk's own frame: a non-scrolling box the overlays can be
            pinned to. The gate centres on THIS rather than the viewport, so it never
            covers the rail its own copy points at. Overlays are siblings of the scroll
            box, not children — inside it they would ride the skeleton's scroll. */}
        <div className="terminal-canvas">
          <div className="terminal-content-area">
            {error && <div className="degraded-banner">Failed to load scenario: {error}</div>}
            {degraded && <DegradedBanner />}
            {/* The skeleton holds the desk until a payload lands, INCLUDING the fetch that
                START kicks off. Unmounting it on `started` alone left the content area empty
                for the length of that fetch, and the desk flashed white between the grey
                skeleton and the cards. The frame is the same box in both states, so there is
                no interval where the reader sees bare page.

                Before START there is nothing to report — the empty frame IS the message. Once
                a run has been asked for, the note names what is being waited on and rides
                above the frame rather than replacing it. */}
            {!state && (
              <>
                {started && !error && (
                  <div className="terminal-panel-note">
                    {isLiveMode ? `starting live session · ${scenario}…` : `loading ${scenario}…`}
                  </div>
                )}
                <SkeletonDesk />
              </>
            )}
            {state && (
              <>
                {/* The tape leads the stacked desk. Order Flow is the only panel that visibly
                    moves on its own, and in the book column it lands three cards and two
                    tables down a phone-length scroll — a reader arriving at the top sees a
                    still page and no evidence anything is running. Above the headline cards
                    it is the first thing on screen and the desk reads as live immediately.

                    A branch rather than CSS `order` because the two homes are different
                    PARENTS, and neither `order` nor `display: contents` can move a node
                    across containers. It costs a remount when a desktop window is dragged
                    across 760px (the tape's scroll position resets); on the phones this is
                    for, the branch is decided once and never re-evaluated. */}
                {stacked && <OrderFlowPanel ticker={state.ticker} />}
                <MetricCards
                  grossExposure={state.grossExposure}
                  netExposure={state.netExposure}
                  risk={state.risk}
                  horizon={horizon}
                  riskLive={state.riskLive}
                  riskSeries={state.riskSeries}
                />
                {/* Two INDEPENDENT column stacks, not paired grid rows: previously each row's
                    height was set by its taller panel and the shorter neighbour rendered dead
                    space. Splitting by subject also reads better — left is the state of the
                    BOOK, right the state of the MODEL. */}
                <div className="terminal-desk">
                  <div>
                    <PositionsPanel
                      rows={state.rows}
                      selectedTicker={selectedTicker}
                      onSelectTicker={selectTicker}
                    />
                    <CorrelationPanel
                      key={`${scenario}-${runId}`}
                      spotlightAssets={state.spotlightAssets}
                      activeAssets={state.activeAssets}
                      latest={state.latest}
                      latestIndex={state.latestIndex}
                      riskLive={state.riskLive}
                      selectedTicker={selectedTicker}
                      selectionSource={selectionSource}
                      onSelectTicker={selectTicker}
                    />
                    {!stacked && <OrderFlowPanel ticker={state.ticker} />}
                  </div>
                  {/* The model column stretches to the book column's height and its last
                      panel takes the slack, so the desk ends on one straight bottom edge. */}
                  <div className="desk-col-model">
                    <ComputeClockPanel
                      compute={state.compute}
                      history={state.history}
                      dccSeries={state.dccSeries}
                      latest={state.latest}
                      riskLive={state.riskLive}
                      cpu={state.cpu}
                      minNamesForRisk={state.minNamesForRisk}
                    />
                    <VarDecompositionPanel
                      rows={state.rows}
                      riskLive={state.riskLive}
                      selectedTicker={selectedTicker}
                      onSelectTicker={selectTicker}
                    />
                  </div>
                </div>
              </>
            )}
          </div>
          {/* The onboarding surfaces are mutually exclusive and the explainer outranks the
              gate: EXPLAIN swaps one for the other rather than stacking two backdrops. */}
          {explainerOpen ? (
            <ExplainerModal
              scenario={scenario}
              action={explainerAction}
              onAction={explainerActions[explainerAction]}
              onClose={closeExplainer}
            />
          ) : !started && gateOpen ? (
            <GateBox
              scenario={scenario}
              seen={seenExplainer}
              onStart={startRun}
              onExplain={openExplainer}
              onClose={() => { markSeen(); setGateOpen(false); setFlashScenario(false); }}
            />
          ) : null}
          {state?.done && !modalDismissed && !explainerOpen && (
            <EndOfRunModal
              scenario={scenario}
              onClose={() => setModalDismissed(true)}
              onRestart={restartRun}
            />
          )}
        </div>
      </div>
    </div>
  );
}
