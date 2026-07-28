"""One bar of live work: a book snapshot in, a serving event out.

This is the single unit both the streaming path and a batch recording are built from,
so the two cannot drift. It calls ``pipeline.one_step_var`` and nothing else — the model
is never reimplemented here.
"""

from __future__ import annotations

import logging
import math

from ..data import UNIVERSE
from ..pipeline import VarResult, one_step_var
from ..scenarios import Scenario
from .config import DESK_MODEL, MIN_NAMES_FOR_RISK
from .grid import Bar
from .orders import held_names, net_book, portfolio_from_orderflow

log = logging.getLogger(__name__)


def is_servable(result: VarResult) -> bool:
    """True when a reassessment is well-posed enough to serialize and play.

    A non-finite VaR or correlation is the residual crash pathology — the same thing
    ``r_cond`` measures. Such a bar cannot enter a payload (``NaN`` is invalid JSON and
    unplayable), so it is skipped and logged rather than given a fabricated value.

    ``sigma_forecast`` is checked for a subtler reason: if any GARCH forecast variance is
    ``nan`` then the covariance is ``nan``, its Cholesky raises, and ``mc_var`` returns a
    zero VaR. Zero is finite, so such a bar used to pass this guard and ship as a silent
    zero. The field does not create that pathology; it makes an existing silent one fatal.
    """
    if not math.isfinite(result.var) or not math.isfinite(result.es):
        return False
    if not all(math.isfinite(x) for row in result.corr_spotlight for x in row):
        return False
    if not all(math.isfinite(x) for row in result.corr_full for x in row):
        return False
    return all(math.isfinite(s) for s in result.sigma_forecast)


def fit_bar(
    bar: Bar,
    orders: list[dict],
    scenario: Scenario,
    *,
    seed: int,
    min_names_for_risk: int = MIN_NAMES_FOR_RISK,
    book_ts: float | None = None,
) -> dict | None:
    """Fit one bar into a ``reassess`` / ``dead`` event, or ``None`` if non-finite.

    A book below the risk floor is a ``dead`` bar: no fit is run at all, so no result
    exists — that is the honest representation, not a patched value.

    ``book_ts`` decouples the estimation window (still the bar's) from the portfolio
    snapshot (orders up to that timestamp), which is what the opening fit needs: bar 0's
    prior-day window priced against the book as it stands right now.

    The event is stamped at the moment its book snapshot was taken, not at the bar. For a
    grid bar the two are the same; for an opening fit the difference is the whole point,
    since a recording fires events off ``market_ts`` and would otherwise replay the
    opening fit at the session open instead of at book-ready.
    """
    cutoff = book_ts if book_ts is not None else bar.market_ts
    orders_so_far = [o for o in orders if o["market_ts"] <= cutoff]
    book = net_book(orders_so_far, UNIVERSE)
    held = held_names(book)

    if held < min_names_for_risk:
        log.info(
            "  %s: DEAD bar %d (held=%d < %d) - no fit run",
            scenario.id, bar.ordinal, held, min_names_for_risk,
        )
        return {
            "type": "dead",
            "market_ts": cutoff,
            "reason": "book_below_min_names",
            "held_names": held,
        }

    portfolio = portfolio_from_orderflow(orders_so_far, UNIVERSE, bar.market_bar[UNIVERSE])
    result = one_step_var(bar.est_window, portfolio, seed=seed, fixes=DESK_MODEL)

    if not is_servable(result):
        log.info(
            "  %s: SKIP non-finite reassessment at step %d (r_cond=%s, var=%s)"
            " - residual crash pathology",
            scenario.id, bar.step, result.r_cond, result.var,
        )
        return None

    log.info(
        "  %s: reassess bar %d (held=%d) -> %.2fs",
        scenario.id, bar.ordinal, held, result.compute_seconds,
    )
    return {
        "type": "reassess",
        "market_ts": cutoff,
        "compute_seconds": round(result.compute_seconds, 2),
        "var": round(result.var, 2),
        "es": round(result.es, 2),
        "converged": bool(result.converged),
        "degraded": bool(result.degraded),
        "held_names": held,
        "dcc": {
            "a": round(float(result.dcc_params["a"]), 4),
            "b": round(float(result.dcc_params["b"]), 4),
            "nu": round(float(result.dcc_params["nu"]), 4),
        },
        "corr_spotlight": result.corr_spotlight,
        "corr": result.corr_full,
        "marketPrices": {a: round(float(bar.market_bar[a]), 2) for a in UNIVERSE},
        "sigma_forecast": [round(float(s), 10) for s in result.sigma_forecast],
    }
