// Live playback: the browser drives the compute, one fit at a time.
//
// Where the recorded engine replays baked durations, here the fit happens NOW on the
// viewer's own CPU. The engine fetches session meta once (order tape and bar grid, which
// cost milliseconds), runs the same free-running market clock, and pulls each bar's fit on
// demand as the clock crosses it. The first risk snapshot therefore lands after ONE real
// fit rather than after a whole session — which is the entire point of not batching.
//
// SKIP TO LATEST, for real. A recording skips stale bars against baked timings; here the
// fit's duration is genuine wall-time, so if the clock crosses several bars while a fetch
// is out, the freshest is requested on completion and the skipped ones are never fetched
// at all. Lag is clamped at one fit, and the crash window lagging behind calm becomes a
// measured fact rather than a replayed one.
//
// The COMPUTE CLOCK is honest by construction: elapsed is real time since the fetch
// started. Only the progress bar's *fill* needs a target, which cannot be known until the
// fit returns — see `createProgressEstimator` and `PROGRESS_CAP` in clock.js, which the
// recorded engine now shares so neither mode paces its bar better than the other.

import { createDesk } from "../book/desk";
import {
  LATCH_SECONDS,
  PROGRESS_CAP,
  clamp01,
  createProgressEstimator,
  marketHorizon,
  parseClock,
  scheduleOrders,
} from "./clock";

// Fetches per bar, counting the first. A rejected fetch says nothing about the model — the
// runner was still starting, or the connection dropped — so the bar is worth asking for
// again; a runner that is genuinely down must not be hammered every frame. Two is the whole
// budget: one retry, then the bar is dropped and the grid moves on.
const MAX_ATTEMPTS = 2;

export function createLivePlayback(meta, fetchBar, onState) {
  const {
    spotlight_assets, replay_factor = 25, sec_per_bar = null, session = null,
    subset = null, min_names_for_risk = 3, orders = [], bars: barMeta = [],
    cpu = null, scenario = null,
  } = meta;

  const estimator = createProgressEstimator(scenario);
  const openSeconds = parseClock(session?.open);
  const orderTape = scheduleOrders(orders, openSeconds);

  const bars = barMeta
    .slice()
    .sort((a, b) => a.market_ts - b.market_ts)
    .map((bar) => ({
      ordinal: bar.ordinal,
      marketTs: bar.market_ts,
      arriveReal: bar.market_ts / replay_factor,
      attempts: 0, // fetches spent on this bar; see MAX_ATTEMPTS
    }));

  const desk = createDesk({
    spotlightAssets: spotlight_assets,
    minNamesForRisk: min_names_for_risk,
    replayFactor: replay_factor,
    secPerBar: sec_per_bar,
    cpu,
    session,
    subset,
  });

  let elapsed = 0; // real seconds since start
  let rafId = null;
  let lastFrameMs = null;
  let orderCursor = 0;

  // skip-to-latest state
  let nextBar = 0; // the next bar that has not arrived
  let pending = []; // arrived bar indices, not yet fetched or skipped
  let inFlight = null; // the bar whose fit is being fetched; null = idle
  let fetchStartReal = null; // when the in-flight fetch started (drives the clock)
  let fetchToken = 0; // guards against a stale fetch resolving after teardown
  let landedUntil = null; // when the completed-frame latch releases; null = not latched
  let landedSeconds = null; // the latched run's model time, which the latch displays
  let deadState = false; // the most recently RESOLVED bar was dead
  let stopped = false;
  let openingFitFired = false;
  let openingInFlight = false;

  const horizon = bars.length
    ? marketHorizon(bars[bars.length - 1].marketTs, sec_per_bar)
    : Infinity;
  const marketElapsed = () => Math.min(elapsed * replay_factor, horizon);

  // 1a. The opening fit, fired once the instant the book crosses the risk floor rather
  //     than at the next bar. The estimation window is still bar 0's; only the portfolio
  //     snapshot moves to now.
  //
  //     Gated to the first gap, matching the recorder: the fit is priced at bar 0's marks,
  //     so it is honest only while bar 0 is the latest bar. A book that first reaches the
  //     floor after bar 1 is not an opening at all — the grid covers it at that bar's own
  //     prices — so it is allowed to lapse.
  //
  //     It never re-arms: after an abort the desk waits for the next grid bar. Re-arming
  //     buys at most one gap of freshness and costs a latch that can loop, and the grid is
  //     already the mechanism for reassessing whenever the book is live.
  function advanceOpeningFit() {
    if (openingFitFired || inFlight != null) return;
    if (bars.length > 1 && marketElapsed() >= bars[1].marketTs) {
      openingFitFired = true; // the first gap is over; the grid owns it from here
      return;
    }
    if (desk.heldNamesCount() < min_names_for_risk) return;

    openingFitFired = true;
    openingInFlight = true;
    inFlight = 0;
    fetchStartReal = elapsed;
    // The opening fit prices bar 0's window against the book RIGHT NOW (`book_ts` below),
    // not against bar 0's arrival book, which was empty. Overwrite what the arrival stored.
    bars[0].bookGross = desk.grossExposureNow();
    bars[0].bookExposures = desk.exposuresNow();
    const token = fetchToken;
    bars[0].attempts++;
    fetchBar(0, { book_ts: marketElapsed() })
      .then((event) => resolveFetch(token, 0, event))
      .catch(() => resolveFetch(token, 0, { type: "error" }));
  }

  // 1b. Arrivals. Deadness is unknown until the fetch returns (unlike a recording's baked
  //     dead bars), so the index is simply queued and the server answers.
  function advanceArrivals() {
    while (nextBar < bars.length && elapsed >= bars[nextBar].arriveReal) {
      // The server prices this bar on the orders up to its market stamp, which is the book
      // the desk holds at this instant. Captured now because the fit lands seconds later,
      // against a book the tape has already grown.
      bars[nextBar].bookGross = desk.grossExposureNow();
      bars[nextBar].bookExposures = desk.exposuresNow();
      pending.push(nextBar);
      nextBar++;
    }
  }

  // 2. Selection, only when idle: take the freshest arrived bar, drop the rest, fetch it.
  function advanceSelection() {
    if (inFlight != null || pending.length === 0) return;
    const chosen = pending[pending.length - 1];
    pending = [];
    inFlight = chosen;
    fetchStartReal = elapsed;
    bars[chosen].attempts++;
    const token = fetchToken;
    fetchBar(bars[chosen].ordinal)
      .then((event) => resolveFetch(token, chosen, event))
      .catch(() => resolveFetch(token, chosen, { type: "error" }));
  }

  // 3. Completion. A reassessment lands into the book; a dead bar puts the desk in the
  //    dead state; a skip (the server's own non-finite verdict) is dropped exactly as a
  //    recording silently omits a non-finite bar; a transport error is retried once.
  function resolveFetch(token, barIndex, event) {
    if (stopped || token !== fetchToken || barIndex !== inFlight) return; // stale
    const bar = bars[barIndex];
    const isOpening = openingInFlight;
    openingInFlight = false;

    // The opening fit launched on a book at the floor; if a trim flattened a name while it
    // was out, the result is stale on arrival and is discarded rather than landed.
    if (isOpening && desk.heldNamesCount() < min_names_for_risk) {
      desk.pushHistory(bar.ordinal, bar.marketTs, "aborted", null);
      deadState = true;
      inFlight = null;
      fetchStartReal = null;
      return;
    }

    // A TRANSPORT FAILURE IS NOT A MODEL VERDICT, and the two used to arrive as one event.
    //
    // `skip` means the fit RAN and came back non-finite. That is deterministic: the
    // ordinal's estimation window and the session seed are both fixed, and the pathology
    // lives in the correlation forecast rather than in the book, so asking again would
    // spend the same 8-30 seconds reaching the same answer. The next bar's window is the
    // only thing that can differ, which is exactly what waiting for it does.
    //
    // A REJECTED FETCH taught us nothing — the runner was still starting up, or the
    // connection dropped mid-flight — and dropping it cost a whole reassessment for a
    // reason that had nothing to do with risk. So the bar goes back in the queue.
    //
    // It is requeued at the FRONT: skip-to-latest still owns the decision, so if fresher
    // bars arrived while the failed fetch was out, the retry loses to them. A retry is
    // worth one fetch, never a step backwards through the session.
    if (event.type === "error" && !isOpening && bar.attempts < MAX_ATTEMPTS) {
      pending.unshift(barIndex);
    }

    if (event.type === "reassess") {
      desk.landReassess(event, bar.bookGross ?? null, bar.bookExposures ?? null);
      // TWO durations, deliberately. The server's `compute_seconds` is the honest model
      // wall-time, which the history and the timing claim report. The ROUND TRIP the
      // browser saw also carries HTTP, JSON and any server-side queueing — so pacing the
      // bar against the server's shorter number made every fill run ahead and sit on the
      // cap before the fit landed. Predict round trips with round trips; keep reporting
      // model seconds.
      const roundTrip = Math.max(0, elapsed - fetchStartReal);
      estimator.record(roundTrip);
      landedSeconds = event.compute_seconds ?? roundTrip;
      landedUntil = elapsed + LATCH_SECONDS;
      desk.pushHistory(bar.ordinal, bar.marketTs, "computed", event.compute_seconds);
      deadState = false;
    } else if (event.type === "dead") {
      desk.pushHistory(bar.ordinal, bar.marketTs, "dead", null);
      deadState = true;
    }
    inFlight = null;
    fetchStartReal = null;
  }

  function computeState() {
    const finished = nextBar >= bars.length && pending.length === 0 && inFlight == null;
    if (finished) {
      return {
        running: false, idle: false, landed: false, done: true, dead: deadState,
        elapsed: 0, target: 0, progress: 1, waitSeconds: 0,
      };
    }
    if (landedUntil != null && elapsed < landedUntil) {
      return {
        running: false, idle: false, landed: true, done: false, dead: false,
        elapsed: landedSeconds, target: landedSeconds, progress: 1, waitSeconds: 0,
      };
    }
    if (inFlight != null) {
      const runElapsed = Math.max(0, elapsed - fetchStartReal);
      const target = estimator.target();
      return {
        running: true, idle: false, landed: false, done: false, dead: false,
        elapsed: runElapsed, target,
        // Capped: an overrunning run keeps creeping but never claims completion.
        progress: target > 0 ? Math.min(clamp01(runElapsed / target), PROGRESS_CAP) : PROGRESS_CAP,
        waitSeconds: 0,
      };
    }
    const next = nextBar < bars.length ? bars[nextBar] : null;
    return {
      running: false, idle: true, landed: false, done: false, dead: deadState,
      elapsed: 0, target: estimator.measured() ? estimator.target() : 0, progress: 0,
      waitSeconds: next ? Math.max(0, next.arriveReal - elapsed) : 0,
    };
  }

  function step() {
    while (orderCursor < orderTape.length && orderTape[orderCursor].market_ts <= marketElapsed()) {
      desk.applyOrder(orderTape[orderCursor]);
      orderCursor++;
    }
    advanceOpeningFit();
    advanceArrivals();
    advanceSelection();
  }

  // The run is over when the LAST BAR'S FIT LANDS — not when the order tape drains. The
  // tape's tail exists to keep the ticker alive while that fit grinds and is deliberately
  // over-provisioned for a slow machine; draining it played the surplus out as 37-40 real
  // seconds of fills with nothing computing. See the twin comment in cannedPlayback.js.
  function isDone() {
    return nextBar >= bars.length && pending.length === 0 && inFlight == null;
  }

  function frame(timestampMs) {
    if (lastFrameMs == null) lastFrameMs = timestampMs;
    elapsed += (timestampMs - lastFrameMs) / 1000;
    lastFrameMs = timestampMs;
    step();
    const done = isDone();
    onState(desk.snapshot({
      marketSeconds: openSeconds + marketElapsed(),
      marketElapsed: marketElapsed(), // seconds after the open: the stamp events carry
      realSeconds: elapsed,
      compute: computeState(),
      done,
    }));
    if (!done && !stopped) rafId = requestAnimationFrame(frame);
  }

  function startLoop() {
    lastFrameMs = null; // resume without crediting paused wall-time to `elapsed`
    if (rafId == null) rafId = requestAnimationFrame(frame);
  }

  function haltLoop() {
    if (rafId != null) cancelAnimationFrame(rafId);
    rafId = null;
  }

  // PAUSE IS NOT STOP. `stop` is teardown — a scenario switch, an unmount, a restart — and
  // it bumps the fetch token so a fit resolving afterwards is ignored, which permanently
  // strands `inFlight`. That is correct for an engine being thrown away and fatal for one
  // that will resume, and pausing during a fit is the common case: fits run back to back
  // for 10-25 seconds each. Routing pause through teardown left the compute bar pinned at
  // the cap with its elapsed climbing forever while the desk silently stopped updating.
  //
  // So pause and resume only halt and restart the frame loop. The fit already on the CPU
  // keeps running and lands normally, and its wall-time is the server's measurement, so
  // the honest-timing claim is unaffected by how long the viewer paused.
  return {
    start() {
      stopped = false;
      startLoop();
    },
    pause: haltLoop,
    resume: startLoop,
    stop() {
      stopped = true;
      fetchToken++; // ignore any in-flight fetch that resolves after teardown
      haltLoop();
    },
  };
}
