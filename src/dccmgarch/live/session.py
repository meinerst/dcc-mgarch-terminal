"""A live session: the bar grid, the order tape, and the two ways to run them.

One session is defined entirely by a scenario and a :class:`SessionSpec` — above all by
its seed. That is what lets the same code serve both run modes: a *fresh* seed each
time is a live run; a *fixed* seed recorded once is the canned payload the deployed
desk replays. There is no second modelling path.

Two ways to consume a session, sharing pass 1 (grid + tape, milliseconds):

* **Streaming** — :func:`build_session_meta` once, then :func:`fit_one_bar` per bar as
  the browser's own clock crosses it. The first risk snapshot lands after one real fit
  rather than after the whole session.
* **Recorded** — :func:`record_session` walks every bar in order and freezes the result,
  including each fit's genuine wall-time.

Fits run serially and are timed one process at a time: ``compute_seconds`` is the
demo's honest-timing claim, and concurrent fits would inflate it through cache pressure
and BLAS oversubscription.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, replace
from datetime import datetime, timedelta

import numpy as np
import pandas as pd

from .. import DEFAULT_SEED
from ..data import UNIVERSE, load_prices
from ..scenarios import Scenario
from .config import (
    BUILDUP_GAPS,
    DEMO_SESSION,
    MIN_NAMES_FOR_RISK,
    ORDER_JITTER,
    ORDER_NOTIONALS,
    ORDER_TAIL_GAPS,
    ORDERS_LAMBDA,
    REASSESS_STRIDE,
    REPLAY_FACTOR,
    SEC_PER_BAR,
    SESSION_BARS,
    STEADY_NOTIONALS,
)
from .cpu import cpu_label
from .fits import fit_bar
from .grid import Bar, build_bar_grid
from .orders import book_dip_below, book_ready_ts, build_order_tape

log = logging.getLogger(__name__)

SESSION_OPEN = "09:30"  # US equities regular hours; the bar files start here


def demo_day(scenario: Scenario) -> str:
    """The trading session the desk replays for this scenario."""
    try:
        return DEMO_SESSION[scenario.id]
    except KeyError:
        raise ValueError(
            f"no demo session configured for scenario {scenario.id!r} "
            f"(have {sorted(DEMO_SESSION)})"
        ) from None


@dataclass(frozen=True)
class SessionSpec:
    """Everything that shapes a session, defaulted to the dialled constants.

    Callers that do not tune pass nothing. The live server exposes these as validated
    query overrides so a fork can dial pacing without editing the source; the terminal
    itself sends none.
    """

    seed: int = DEFAULT_SEED
    replay_factor: int = REPLAY_FACTOR
    sec_per_bar: int = SEC_PER_BAR
    reassess_stride: int = REASSESS_STRIDE
    session_bars: int = SESSION_BARS
    max_bars: int | None = None
    orders_lambda: float = ORDERS_LAMBDA
    buildup_gaps: int = BUILDUP_GAPS
    min_names_for_risk: int = MIN_NAMES_FOR_RISK
    order_notionals: tuple = ORDER_NOTIONALS
    steady_notionals: tuple = STEADY_NOTIONALS
    order_jitter: float = ORDER_JITTER
    tail_gaps: int = ORDER_TAIL_GAPS

    def with_seed(self, seed: int) -> SessionSpec:
        return replace(self, seed=seed)


def plan_session(
    prices: pd.DataFrame, scenario: Scenario, spec: SessionSpec
) -> tuple[list[Bar], list[dict]]:
    """Pass 1: the bar grid plus the whole order tape. Deterministic in ``spec.seed``.

    Costs milliseconds because nothing is fitted. Every entry point derives its grid and
    tape from here, which is what makes the per-bar streaming path stateless: given the
    same seed it reconstructs exactly the session the browser is already playing.
    """
    rng = np.random.default_rng(spec.seed)
    bars = build_bar_grid(
        prices,
        scenario,
        session_day=demo_day(scenario),
        session_bars=spec.session_bars,
        reassess_stride=spec.reassess_stride,
        sec_per_bar=spec.sec_per_bar,
        max_bars=spec.max_bars,
    )
    orders = build_order_tape(
        rng,
        bars,
        orders_lambda=spec.orders_lambda,
        buildup_gaps=spec.buildup_gaps,
        order_notionals=spec.order_notionals,
        steady_notionals=spec.steady_notionals,
        sec_per_bar=spec.sec_per_bar,
        tail_gaps=spec.tail_gaps,
        order_jitter=spec.order_jitter,
    )
    return bars, orders


def session_close(spec: SessionSpec) -> str:
    """When the replay stops, derived from the grid rather than written down.

    The desk plays the session's opening stretch, not the whole day, and the label has
    to say which: a hardcoded 16:00 was true of the trading day and false of the run.
    """
    bars = spec.session_bars if spec.max_bars is None else min(spec.session_bars, spec.max_bars)
    played = bars * spec.reassess_stride * spec.sec_per_bar
    return (
        datetime.strptime(SESSION_OPEN, "%H:%M") + timedelta(seconds=played)
    ).strftime("%H:%M")


def session_header(scenario: Scenario, spec: SessionSpec) -> dict:
    """The scenario's top-level display fields, shared by both consumption paths.

    The desk plays one real trading session — ``DEMO_SESSION[scenario]``, from the open
    for as many bars as the grid holds: the terminal reads ``session`` for its market
    clock and ``subset`` for the sidebar's selected-scenario line. ``open`` is what the
    clock adds ``market_ts`` to, so it is the session's own 09:30 and not a stitch.
    """
    session_date = demo_day(scenario)
    closes_at = session_close(spec)
    return {
        "scenario": scenario.id,
        "spotlight_assets": UNIVERSE,
        "replay_factor": spec.replay_factor,
        "sec_per_bar": spec.sec_per_bar,
        "min_names_for_risk": spec.min_names_for_risk,
        # The machine the wall-time was measured on: baked into a recording so the
        # deployed build names the recording's chip, read from the host when live.
        "cpu": cpu_label(),
        "session": {
            "date": session_date,
            "open": SESSION_OPEN,
            "close": closes_at,
            "tz": "ET",
        },
        "subset": {
            "date": session_date,
            "session_open": SESSION_OPEN,
            "session_close": closes_at,
            "tz": "ET",
        },
    }


def build_session_meta(
    scenario: Scenario,
    *,
    prices: pd.DataFrame | None = None,
    spec: SessionSpec | None = None,
) -> dict:
    """Pass 1 only: header + full order tape + bar grid, no fits.

    The live terminal fetches this once at session start so the tape and market clock
    run immediately. The seed is echoed back so the stateless per-bar calls reproduce
    exactly this grid and tape.
    """
    spec = spec or SessionSpec()
    prices = load_prices() if prices is None else prices
    bars, orders = plan_session(prices, scenario, spec)
    return {
        **session_header(scenario, spec),
        "seed": spec.seed,
        "orders": orders,
        "bars": [{"ordinal": bar.ordinal, "market_ts": bar.market_ts} for bar in bars],
    }


def fit_one_bar(
    scenario: Scenario,
    ordinal: int,
    *,
    prices: pd.DataFrame | None = None,
    spec: SessionSpec | None = None,
    book_ts: float | None = None,
) -> dict:
    """Pass 2, one bar: rebuild the session plan (milliseconds) and fit bar ``ordinal``.

    Stateless by design. A non-finite result becomes a ``skip`` event, because the caller
    must be answered — the frontend then advances without landing it, mirroring the
    recorded path's silent omission. Raises ``IndexError`` for an unknown ordinal.
    """
    spec = spec or SessionSpec()
    prices = load_prices() if prices is None else prices
    bars, orders = plan_session(prices, scenario, spec)
    if not 0 <= ordinal < len(bars):
        raise IndexError(f"bar {ordinal} out of range [0, {len(bars)})")

    bar = bars[ordinal]
    event = fit_bar(
        bar,
        orders,
        scenario,
        seed=spec.seed,
        min_names_for_risk=spec.min_names_for_risk,
        book_ts=book_ts,
    )
    if event is None:
        return {"type": "skip", "market_ts": bar.market_ts, "reason": "non_finite"}
    return event


def _opening_fit(
    bars: list[Bar], orders: list[dict], scenario: Scenario, spec: SessionSpec
) -> dict | None:
    """The fit fired the instant the book crosses the risk floor, before bar 1.

    The live desk watches its own book and fires this client-side; a recording only
    replays stamped events, so it has to be baked for the two modes to pace alike.

    Gated to the first gap: the fit is priced at bar 0's marks, so it is honest only
    while bar 0 is the latest bar. A book that first reaches the floor after bar 1 is not
    an opening at all — the grid already covers it, at that bar's own prices.

    It fires at most once per run in both modes. After an abort the desk waits for the
    next grid bar rather than re-arming: re-arming buys at most one gap of freshness and
    costs a latch that can loop, and the grid is already the mechanism for "reassess
    whenever the book is live".
    """
    if len(bars) <= 1:
        return None
    ready_ts = book_ready_ts(orders, spec.min_names_for_risk)
    if ready_ts is None or ready_ts >= bars[1].market_ts:
        return None

    log.info("  %s: opening fit at book-ready market_ts %.0f", scenario.id, ready_ts)
    event = fit_bar(
        bars[0],
        orders,
        scenario,
        seed=spec.seed,
        min_names_for_risk=spec.min_names_for_risk,
        book_ts=ready_ts,
    )
    if event is None or event["type"] != "reassess":
        return event

    # The fit occupied `compute_seconds` of real time, i.e. that times the replay factor
    # of market time. If the book went under the floor inside that window the result is
    # stale on arrival: discard it and go dead, exactly as the live desk does.
    window_end = ready_ts + event["compute_seconds"] * spec.replay_factor
    dip_held = book_dip_below(orders, spec.min_names_for_risk, ready_ts, window_end)
    if dip_held is None:
        return event

    log.info(
        "  %s: opening fit ABORTED - book fell to %d names (< %d) before it landed",
        scenario.id, dip_held, spec.min_names_for_risk,
    )
    return {
        "type": "dead",
        "market_ts": ready_ts,
        "reason": "book_below_min_names",
        "held_names": dip_held,
    }


def record_session(
    scenario: Scenario,
    *,
    prices: pd.DataFrame | None = None,
    spec: SessionSpec | None = None,
) -> dict:
    """Run a whole session and freeze it into the serving payload.

    This is what a recording is: the live path, run once, with every event stamped on
    the market clock and each fit's real wall-time recorded alongside it.
    """
    spec = spec or SessionSpec()
    prices = load_prices() if prices is None else prices

    bars, orders = plan_session(prices, scenario, spec)
    events: list[dict] = list(orders)

    opening = _opening_fit(bars, orders, scenario, spec)
    if opening is not None:
        events.append(opening)

    # Progress is reported per bar because a recording is otherwise a 10-20 minute blind
    # wait. The estimate extrapolates the mean wall-time of the bars done so far, dead
    # bars included: they cost nothing but they are part of what is left, so a mean over
    # all bars predicts honestly where a mean over fits alone would over-estimate.
    started = time.monotonic()
    for done, bar in enumerate(bars, start=1):
        event = fit_bar(
            bar, orders, scenario, seed=spec.seed, min_names_for_risk=spec.min_names_for_risk
        )
        if event is not None:  # None = a non-finite bar, skipped rather than fabricated
            events.append(event)
        spent = time.monotonic() - started
        eta_min, eta_sec = divmod(int(spent / done * (len(bars) - done)), 60)
        log.info(
            "  %s: [%d/%d] %.0fs elapsed - eta %dm %02ds",
            scenario.id, done, len(bars), spent, eta_min, eta_sec,
        )

    # `market_ts` is the sole timeline: orders and bars interleave on it.
    events.sort(key=lambda event: event["market_ts"])
    return {**session_header(scenario, spec), "events": events}
