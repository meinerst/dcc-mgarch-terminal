// What the two playback engines share: the market clock's arithmetic and the display
// constants that must read the same in a recording and in a live run.
//
// The engines themselves stay separate — one replays baked timings, the other measures
// real ones — but a divergence in these values would show up as the desk behaving
// differently between the two modes for no reason a viewer could see.

// Must match ORDER_TAIL_GAPS in src/dccmgarch/live/config.py — the number of bar gaps the
// order tape is scheduled PAST the last bar so the ticker stays alive while the final fit
// runs. Used here only to stop the market clock at the end of that tape, so a slow machine
// cannot run the clock off into an empty evening.
const ORDER_TAIL_GAPS = 4;

// How long the compute bar holds its completed frame after a fit lands, in real seconds.
// NOT a pause in the compute: the next fit starts on the same frame the previous one
// resolves, so the back-to-back cadence is untouched. Without the latch the bar flips from
// full to zero within one frame and a viewer never sees a run complete.
export const LATCH_SECONDS = 0.6;

/** "HH:MM" -> seconds after midnight. Defaults to the 09:30 US open. */
export function parseClock(hhmm) {
  if (typeof hhmm !== "string") return 34200;
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!match) return 34200;
  return Number(match[1]) * 3600 + Number(match[2]) * 60;
}

/**
 * The market timestamp the clock stops at: the last bar plus the tape's tail.
 *
 * A run ends when the last bar's fit LANDS, not when the bar arrives, so the market clock
 * free-runs through the fit. This is the CEILING on that free run, not the end of the run:
 * the tail is over-provisioned for a slow machine, so a normal run ends well inside it and
 * the surplus orders are never fired. Clamping matters only for a machine slow enough to
 * grind past the whole tail, which would otherwise run the clock off into an empty evening.
 */
export function marketHorizon(lastBarMarketTs, secPerBar) {
  if (lastBarMarketTs == null) return Infinity;
  return lastBarMarketTs + ORDER_TAIL_GAPS * (secPerBar ?? 300);
}

/** The order tape, market-ordered and stamped with the wall time the ticker renders. */
export function scheduleOrders(orders, openSeconds) {
  return orders
    .map((order) => ({ ...order, clock: openSeconds + order.market_ts }))
    .sort((a, b) => a.market_ts - b.market_ts);
}

// ---------------------------------------------------------------------------
// Progress estimation — how full the compute bar looks while a fit is in flight.
//
// SHARED ON PURPOSE, and this is the whole reason it moved here. A recording knows
// every duration up front, so the canned engine used to pace the bar off the recorded
// `compute_seconds` of the fit currently running. That produced a desk no live desk can
// be: a countdown accurate to the tenth of a second, a fill that lands on exactly 100%
// every time, and — because the estimate was never wrong — the panel's "over estimate"
// state was unreachable in the deployed demo. Crash fits are meant to read as
// unpredictably expensive; predicting them perfectly is the opposite of the exhibit.
//
// So the recorded duration now decides only WHEN a fit lands. How full the bar looks is
// estimated from fits already finished, identically in both engines.
//
// The seconds displayed are always real elapsed. Only the FILL uses this.

// The target before anything has been measured. Crash fits are materially slower than
// calm ones (the optimizer works harder on a stressed correlation), so one shared guess
// made the crash bar sprint to the cap and sit there.
const FIRST_ESTIMATE = { calm: 10, crash: 25 };
const FIRST_ESTIMATE_FALLBACK = 10;

// A single outlier run (a bad optimizer start) would poison the next bar's pacing, so
// the target is the median of recent runs rather than the last one.
const ESTIMATE_WINDOW = 3;

// The fill NEVER reaches full while a fit is in flight. The target is an estimate, so an
// overrunning run would otherwise show a full — and, in the panel, green — bar while the
// model is still grinding, claiming a completion that has not happened. Capping short
// keeps full-and-green as the exclusive signal of a genuinely landed fit.
export const PROGRESS_CAP = 0.97;

// Where the estimate lands the fill. The cap used to be a hard clamp, and the fill hit it
// the moment a run passed its estimate and then FROZE there — on the crash payload, nine
// motionless seconds of a twenty-five-second fit, which reads as a hung desk rather than a
// slow one. The knee leaves room to keep moving: the estimate is worth 90% of the track,
// and the overrun spends the last 7% approaching the cap without ever arriving.
const SOFT_KNEE = 0.9;

/**
 * How full the fill sits, from the run's real elapsed and the estimate paced off past fits.
 *
 * Strictly increasing and strictly below `PROGRESS_CAP` — so the bar is always visibly
 * alive while the model grinds, and full is still something only a landed fit can show.
 */
export function fillFraction(runElapsed, target) {
  if (!(target > 0)) return PROGRESS_CAP; // nothing to pace against: sit at the cap
  const ratio = Math.max(0, runElapsed) / target;
  if (ratio <= 1) return ratio * SOFT_KNEE;
  return PROGRESS_CAP - (PROGRESS_CAP - SOFT_KNEE) * Math.exp(1 - ratio);
}

function median(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * Paces the compute bar from durations already observed.
 *
 * `record` takes whatever each engine can honestly know once a fit is OVER — the live
 * engine's browser round trip, the recorded engine's landed duration — never a duration
 * belonging to a fit still running or still to come.
 */
export function createProgressEstimator(scenario) {
  const first = FIRST_ESTIMATE[scenario] ?? FIRST_ESTIMATE_FALLBACK;
  const recent = [];
  return {
    record(seconds) {
      if (!Number.isFinite(seconds) || seconds <= 0) return;
      recent.push(seconds);
      if (recent.length > ESTIMATE_WINDOW) recent.shift();
    },
    target() {
      return recent.length ? median(recent) : first;
    },
    /** Whether anything has been measured yet — the idle row shows nothing until it has. */
    measured() {
      return recent.length > 0;
    },
  };
}
