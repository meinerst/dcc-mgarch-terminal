"""The market-clock bar grid — everything a session knows before any model runs.

Laying the grid down first is what makes a recorded session replayable: each bar's
prices are simply the last row of its estimation window, available without fitting, so
the whole order tape can be stamped on the market timeline before the first fit starts.
The book is then a pure function of ``market_ts`` and never of measured compute time.

The grid is **one real trading session**: contiguous bars from one day, in order, at the
bar file's own 5-minute step, so ``market_ts`` is literally seconds after that day's
09:30 open and the desk can show a wall clock. It is not a stride across the scenario's
five-day window — that walked bars 65 market minutes apart while stamping them 5 apart,
under a header naming a single date.
"""

from __future__ import annotations

from dataclasses import dataclass

import pandas as pd

from ..scenarios import WINDOW_OBS, Scenario


@dataclass(frozen=True)
class Bar:
    """One bar on the replay grid."""

    ordinal: int
    step: int  # offset into the scenario window (row index)
    market_ts: float  # seconds after the session open
    est_window: pd.DataFrame  # trailing estimation window for this bar
    market_bar: pd.Series  # prices at this bar (== est_window.iloc[-1])


def session_start_step(
    prices: pd.DataFrame, scenario: Scenario, session_day: str
) -> int:
    """Window step whose bar is ``session_day``'s 09:30 print.

    A step ``s`` forecasts the window's observation ``s`` from data ending at row
    ``window_start + s - 1``, so that row — not ``window_start + s`` — is the bar the
    desk marks the book at, and the offset carries the +1.

    The day is required to lie inside the scenario's own window. That is the guard that
    keeps the public repository runnable: its `data/` is trimmed to whole trading days
    spanning each frozen window, so a demo day picked outside one would resolve here on
    the full file and 404 on the trimmed one.
    """
    day = pd.to_datetime(prices.index).normalize()
    target = pd.Timestamp(session_day)

    if not pd.Timestamp(scenario.window_start_date) <= target <= pd.Timestamp(
        scenario.window_end_date
    ):
        raise ValueError(
            f"{scenario.id}: demo session {target.date()} is outside the window "
            f"({scenario.window_start_date} .. {scenario.window_end_date})"
        )
    if not (day == target).any():
        raise ValueError(f"{scenario.id}: no bars for demo session {target.date()}")

    return int((day == target).argmax()) - scenario.window_start_idx + 1


def build_bar_grid(
    prices: pd.DataFrame,
    scenario: Scenario,
    *,
    session_day: str,
    session_bars: int,
    reassess_stride: int,
    sec_per_bar: int,
    max_bars: int | None = None,
) -> list[Bar]:
    """The bars a session reassesses on. Costs milliseconds: no model runs here.

    ``session_bars`` bars from ``session_day``'s open, at ``reassess_stride`` (1 = every
    bar the file has). ``max_bars`` truncates a tuning run without moving the grid, so a
    short run plays the opening of the same session the full one does.
    """
    lead_start = scenario.lead_in_start_idx
    window_start = scenario.window_start_idx
    start = session_start_step(prices, scenario, session_day)
    count = session_bars if max_bars is None else min(session_bars, max_bars)
    last = start + (count - 1) * reassess_stride

    if last > WINDOW_OBS:
        raise ValueError(
            f"{scenario.id}: {count} bars from {session_day} at stride {reassess_stride} "
            f"run past the window (step {last} > {WINDOW_OBS})"
        )

    bars: list[Bar] = []
    for ordinal, step in enumerate(range(start, last + 1, reassess_stride)):
        est_window = prices.iloc[lead_start + step : window_start + step]
        bars.append(
            Bar(
                ordinal=ordinal,
                step=step,
                market_ts=float(ordinal * sec_per_bar),
                est_window=est_window,
                market_bar=est_window.iloc[-1],
            )
        )
    return bars


def gap_windows(
    bars: list[Bar], *, sec_per_bar: int, tail_gaps: int
) -> list[tuple[float, float, pd.Series]]:
    """The open intervals orders are scheduled into: one per bar gap, plus the tail.

    Real gaps run between consecutive bars. Tail gaps are synthetic — they extend past
    the last bar at the same cadence to cover the stretch the market clock free-runs
    through while the final fit grinds. No bar exists there, so no fit is ever
    scheduled for them; they carry orders only.

    Each window pins the price bar that fills its orders: always the last bar known at
    that market time, which for every tail gap is the final real bar. Prices past the
    grid do not exist, and inventing them would fabricate market data the model never saw.
    """
    windows = [
        (bars[k - 1].market_ts, bars[k].market_ts, bars[k - 1].market_bar)
        for k in range(1, len(bars))
    ]
    last = bars[-1]
    windows += [
        (
            last.market_ts + i * sec_per_bar,
            last.market_ts + (i + 1) * sec_per_bar,
            last.market_bar,
        )
        for i in range(tail_gaps)
    ]
    return windows
