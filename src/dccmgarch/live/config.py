"""Pacing and orderflow constants for the live desk, plus the model it runs.

These are dialled values, not derivations: each one was set against measured compute
time on a 30-name book and is documented with the measurement that fixed it. They are
producer-side, so changing any of them invalidates a recorded session.
"""

from __future__ import annotations

from ..pipeline import FixConfig

# Two-clock replay: the market clock advances at REPLAY_FACTOR x real time over
# 5-minute bars, so a bar plays in 12 real seconds. Measured 30-asset compute is
# ~8.9 s (calm) and ~13.6 s (crash) per fit, so calm keeps up with a little idle
# while crash runs perpetually about one fit behind. That contrast at one identical
# market speed is the exhibit.
REPLAY_FACTOR = 25
SEC_PER_BAR = 300

# The desk replays ONE real trading session, contiguous and in order: the first
# SESSION_BARS bars of DEMO_SESSION[scenario] at the bar file's native 5-minute step.
# 24 bars is 09:30-11:30 of market time and about 4.8 minutes of demo at 12 s/bar.
#
# Until 2026-07-27 the grid strode `range(0, 389, 13)` across the window's whole five
# trading days while the header labelled it a single date: consecutive bars sat 65 real
# market minutes apart and were stamped 5 apart, and the market clock covered 2.5 h of
# a session it called 09:30-16:00. Prices, order tape and compute time were real; the
# calendar was stitched, and nothing on screen said so.
#
# The day is a DISPLAY choice, so it lives here and not in `scenarios.py`: that module
# is the frozen evaluation spec the desk and the backtest must read identically. Both
# days sit inside their own scenario window (asserted in `grid.session_start_step`),
# which is also what keeps the public data trim untouched - it keeps whole trading days
# spanning each window.
#
# crash = 2020-03-16, the Level-1 circuit-breaker day: the halt fires inside the cut
# (61 frozen prints across the 30 names in the first two hours, then a 19.6% resume
# bar), so `mask_halts` is visibly doing work. The window's last day, 2020-03-20, was
# the inherited pick and is the dullest first two hours of that week (-1.14%).
# calm = 2021-10-14, the calm window's last session; every day in it is equally quiet.
DEMO_SESSION = {"calm": "2021-10-14", "crash": "2020-03-16"}
SESSION_BARS = 24
REASSESS_STRIDE = 1

# Arrivals per bar gap. The rate is constant across the whole session — the tape
# never slows down. What changes is each order's effect on the book: the first
# BUILDUP_GAPS gaps open positions (gross exposure ramps), after which the same-rate
# tape mean-reverts each name toward the book it just built, so orders keep landing
# while exposure barely moves and attention stays on the model.
#
# 8 of the session's 23 gaps: the ramp ends at 10:10, leaving about two thirds of the
# run on a stable book, where a moving VaR is the model moving and not the position.
# It was 12 against a 30-bar grid; at 24 bars that would have spent half the demo —
# and on 2020-03-16 the most violent stretch — watching exposure climb.
ORDERS_LAMBDA = 15.0
BUILDUP_GAPS = 8
BUILDUP_GROW_PROB = 0.75  # during buildup, add to a held name 3/4 of the time

# Arrivals are stratified (a jittered grid), not Poisson. Exponential inter-arrivals
# are the *maximally* bursty process at a given rate: the tape visibly clustered then
# went silent, and raising the rate scaled the variance right along with the mean. Each
# gap is now split into equal slots with one arrival jittered inside each, so maximum
# silence is bounded at about two slots instead of unbounded. 0 = metronome, 1 = uniform
# within the slot (slots never overlap, so arrivals stay ordered without a sort).
# Measured at lambda=15: longest silence fell from 89.5 to 32.2 market-seconds.
ORDER_JITTER = 0.7

# Bar gaps of tape scheduled PAST the last bar. The run ends when the last bar's fit
# LANDS, not when the bar arrives, so the market clock free-runs through a tail whose
# length is real compute time — machine-specific and unbounded. No fixed number of
# gaps can match it, so the tape is over-provisioned and the surplus is never fired:
# 4 gaps is ~48 s of real coverage at 25x, past a slow machine's crash fit. Slowing
# the market clock to fit the tail instead would make the labelled replay factor a lie.
ORDER_TAIL_GAPS = 4

# Orders are dollar notionals converted to whole shares at the fill price, not share
# counts: across 30 names spanning ~$20-$500 a fixed share count would let high-priced
# names dominate gross exposure, turning the VaR decomposition into a chart of which
# stock is expensive.
ORDER_NOTIONALS = (10_000.0, 15_000.0, 20_000.0)  # buildup
STEADY_NOTIONALS = (5_000.0, 10_000.0)  # steady churn

# Below this many held names a bar is dead: no fit is run and the desk renders its risk
# panels inert. This is a display floor, not a model requirement — it prevents a
# half-formed risk snapshot while the book is still opening.
MIN_NAMES_FOR_RISK = 3

# The desk plays the FIXED model. The crash window only yields a well-posed VaR with
# the convergence trio on, and calm rides the same configuration so the two scenarios
# are one consistent desk rather than two different models.
#
# `reseasonalize_forecast` is deliberately off: it was measured and shelved (it
# regressed coverage on all four non-crash windows through an unexplained uniform
# level bias), so it remains a backtest before/after, not part of what ships here.
DESK_MODEL = FixConfig(
    include_expected_returns=False,  # drop expected returns from VaR
    reseasonalize_forecast=False,  # measured and shelved, see above
    mask_halts=True,  # a circuit-breaker halt is missing data, not a zero return
    robust_optimizer=True,  # reparameterized DCC optimizer
    guard_pit=True,  # clamp a saturated PIT so the normal quantile stays finite
    fallback_ccc_on_fail=True,  # constant-correlation safety valve -> degraded banner
)
