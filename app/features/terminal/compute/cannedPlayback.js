// Playback of a recorded session: dumb replay of stamped events on two clocks.
//
//   Market clock   the recorded session's own opening stretch (09:30 -> 11:30) at replay_factor x
//                  real time. Every event in the payload carries a baked `market_ts`, so
//                  this engine only ever COMPARES against recorded stamps; it never
//                  derives when something should fire.
//   Compute clock  the honest, unaccelerated wall-time each reassessment took. Never
//                  accelerated — that is the terminal's whole thesis. The recording's
//                  durations say when a fit LANDS; the progress bar is estimated off fits
//                  already finished, the same way the live engine does it, so a replay
//                  cannot predict itself better than a real desk can (clock.js).
//
// SKIP TO LATEST. A bar arrives when the market clock crosses its stamp, and the model
// fits one bar at a time for its recorded duration. If more bars arrive mid-fit, the model
// takes the FRESHEST on completion and drops the stale ones, so lag is clamped at one fit
// and never accumulates. A dropped bar leaves no trace: reassessing on the newest state is
// what the scheduler is for. Calm mostly keeps up and idles; crash runs perpetually about
// one fit behind. Same market speed, different model — that contrast is the exhibit.
//
// The OPENING FIT and DEAD BARS are likewise baked events, not rules applied here. The
// live desk watches its own book and decides both in real time; a recording carries the
// decisions it already made, stamped.

import { createDesk } from "../book/desk";
import {
  LATCH_SECONDS,
  createProgressEstimator,
  fillFraction,
  marketHorizon,
  parseClock,
  scheduleOrders,
} from "./clock";

// Fail loudly on a payload predating the market-clock timeline rather than half-playing
// it. Without this an old recording plays a deceptively plausible desk: bars land so the
// compute clock animates, but no order ever fires and the risk panels never wake — a
// broken state that looks like a model bug.
function assertSchema(events) {
  const staleOrder = events.find((e) => e.type === "order" && !Number.isFinite(e.market_ts));
  const staleBar = events.find((e) => e.type === "reassess" && e.held_names == null);
  if (staleOrder || staleBar) {
    throw new Error(
      "payload predates the current schema: " +
        `${staleOrder ? "orders lack `market_ts`" : "reassessments lack `held_names`"}. ` +
        "Re-record with `python -m private.recorder.run`, or run the live server."
    );
  }
}

export function createPlayback(payload, onState) {
  assertSchema(payload.events);

  const {
    spotlight_assets, replay_factor = 25, sec_per_bar = null, session = null,
    subset = null, min_names_for_risk = 3, events, cpu = null, scenario = null,
  } = payload;

  // Paced from fits that have already LANDED, exactly as the live engine paces from round
  // trips it has already seen. The recording's own durations are used for when a fit ends,
  // never for how full the bar looks while it runs — see clock.js.
  const estimator = createProgressEstimator(scenario);
  const openSeconds = parseClock(session?.open);
  const orders = scheduleOrders(events.filter((e) => e.type === "order"), openSeconds);

  const bars = events
    .filter((e) => e.type === "reassess" || e.type === "dead")
    .sort((a, b) => a.market_ts - b.market_ts)
    .map((event, index) => ({
      index,
      event,
      dead: event.type === "dead",
      marketTs: event.market_ts,
      arriveReal: event.market_ts / replay_factor, // real seconds until this bar arrives
      computeSeconds: event.compute_seconds ?? 0,
    }));

  let elapsed = 0; // real seconds since start
  let rafId = null;
  let lastFrameMs = null;
  let orderCursor = 0;

  // skip-to-latest state
  let nextBar = 0; // the next bar that has not arrived
  let pending = []; // arrived, not yet computed or skipped
  let currentBar = null; // the bar the in-flight fit is computing
  let busyUntilReal = null; // when that fit completes; null = idle
  let busySinceReal = null; // when it started (drives the progress bar)
  let landedUntil = null; // when the completed-frame latch releases; null = not latched
  let landedSeconds = null; // the latched run's duration, which the latch displays
  let deadState = false; // the most recently ARRIVED bar was dead

  const horizon = bars.length
    ? marketHorizon(bars[bars.length - 1].marketTs, sec_per_bar)
    : Infinity;
  const marketElapsed = () => Math.min(elapsed * replay_factor, horizon);

  const desk = createDesk({
    spotlightAssets: spotlight_assets,
    minNamesForRisk: min_names_for_risk,
    replayFactor: replay_factor,
    secPerBar: sec_per_bar,
    cpu,
    session,
    subset,
  });

  // 1. Arrivals. A dead bar ABORTS whatever is in flight — the book fell below the display
  //    floor, so the result in progress is moot — and puts the desk in the dead state.
  function advanceArrivals() {
    while (nextBar < bars.length && elapsed >= bars[nextBar].arriveReal) {
      const bar = bars[nextBar];
      if (bar.dead) {
        if (currentBar != null) {
          desk.pushHistory(bars[currentBar].index, bars[currentBar].marketTs, "aborted", null);
          currentBar = null;
          busyUntilReal = null;
          busySinceReal = null;
        }
        pending = [];
        desk.pushHistory(bar.index, bar.marketTs, "dead", null);
        deadState = true;
        landedUntil = null; // the dead state outranks a lingering completed frame
      } else {
        // The book as it stands at this bar's own market stamp — which is the book the
        // recorded fit was priced on. Read here rather than at landing, because by then
        // the tape has moved on by a whole fit's worth of fills.
        bar.bookGross = desk.grossExposureNow();
        bar.bookExposures = desk.exposuresNow();
        pending.push(nextBar);
        deadState = false;
      }
      nextBar++;
    }
  }

  // 2. Completion of the in-flight fit.
  function advanceCompletion() {
    if (busyUntilReal == null || elapsed < busyUntilReal) return;
    const bar = bars[currentBar];
    desk.landReassess(bar.event, bar.bookGross ?? null, bar.bookExposures ?? null);
    desk.pushHistory(bar.index, bar.marketTs, "computed", bar.computeSeconds);
    estimator.record(bar.computeSeconds); // only now that this fit is over
    landedSeconds = bar.computeSeconds;
    landedUntil = elapsed + LATCH_SECONDS; // hold the frame; the next fit still starts now
    currentBar = null;
    busyUntilReal = null;
    busySinceReal = null;
  }

  // 3. Selection, only when idle: take the freshest arrived bar and drop the rest.
  function advanceSelection() {
    if (busyUntilReal != null || pending.length === 0) return;
    const chosen = pending[pending.length - 1];
    pending = [];
    currentBar = chosen;
    busySinceReal = elapsed;
    busyUntilReal = elapsed + bars[chosen].computeSeconds;
  }

  // The compute clock's state: a fit in flight, idle between bars, a book too thin to
  // price, or the whole sequence done.
  function computeState() {
    const finished = nextBar >= bars.length && pending.length === 0 && busyUntilReal == null;
    if (finished) {
      return {
        running: false, idle: false, landed: false, done: true, dead: deadState,
        elapsed: 0, target: 0, progress: 1, waitSeconds: 0,
      };
    }
    // The latch holds the just-completed run's frame even though the next fit may already
    // be in flight, so full-and-green always means "a fit landed".
    if (landedUntil != null && elapsed < landedUntil) {
      return {
        running: false, idle: false, landed: true, done: false, dead: false,
        elapsed: landedSeconds, target: landedSeconds, progress: 1, waitSeconds: 0,
      };
    }
    if (busyUntilReal != null) {
      // The in-flight bar's own recorded duration is NOT read here. It decides
      // `busyUntilReal` — when this fit lands — and nothing about the fill.
      const runElapsed = Math.max(0, elapsed - busySinceReal);
      const target = estimator.target();
      return {
        running: true, idle: false, landed: false, done: false, dead: false,
        elapsed: runElapsed, target,
        // An overrunning run keeps creeping but never claims completion (clock.js).
        progress: fillFraction(runElapsed, target),
        waitSeconds: 0,
      };
    }
    // Idle: the previous run finished early, or the bar was dead. Wait for the next bar.
    // `waitSeconds` is the market clock, which both engines know ahead of time from the bar
    // grid; the compute target stays an estimate off past fits.
    const next = nextBar < bars.length ? bars[nextBar] : null;
    return {
      running: false, idle: true, landed: false, done: false, dead: deadState,
      elapsed: 0, target: estimator.measured() ? estimator.target() : 0, progress: 0,
      waitSeconds: next ? Math.max(0, next.arriveReal - elapsed) : 0,
    };
  }

  function step() {
    while (orderCursor < orders.length && orders[orderCursor].market_ts <= marketElapsed()) {
      desk.applyOrder(orders[orderCursor]);
      orderCursor++;
    }
    advanceArrivals();
    advanceCompletion();
    advanceSelection();
  }

  // The run is over when the LAST BAR'S FIT LANDS — not when the order tape drains.
  //
  // The tape is deliberately scheduled ORDER_TAIL_GAPS past the last bar so the ticker
  // stays alive while that final fit grinds, and it is over-provisioned for a slow machine
  // (config.py: "the surplus is never fired"). Waiting for it to drain fired all of it: the
  // desk sat for 37-40 real seconds printing fills with the compute panel already reading
  // "sequence complete", and the market clock ran 15 minutes past the close in the header.
  // Surplus tape is coverage, not content.
  function isDone() {
    return nextBar >= bars.length && pending.length === 0 && busyUntilReal == null;
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
    if (!done) rafId = requestAnimationFrame(frame);
  }

  // The same four verbs as the live engine, so the desk can drive either without knowing
  // which it holds. A recording has no fetches to strand, so pause and stop do the same
  // work here; the split exists to keep the two engines interchangeable. Both are
  // idempotent on `rafId`: React invokes state updaters twice under StrictMode, and a
  // second live loop would double every update.
  function startLoop() {
    lastFrameMs = null; // resume without crediting paused wall-time to `elapsed`
    if (rafId == null) rafId = requestAnimationFrame(frame);
  }

  function haltLoop() {
    if (rafId != null) cancelAnimationFrame(rafId);
    rafId = null;
  }

  return { start: startLoop, pause: haltLoop, resume: startLoop, stop: haltLoop };
}
