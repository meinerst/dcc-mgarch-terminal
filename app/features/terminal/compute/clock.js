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

export const clamp01 = (x) => Math.max(0, Math.min(1, x));

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
