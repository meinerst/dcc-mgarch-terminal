"""The frozen evaluation windows, defined by DATE and located in the bar files.

Dates come from thesis Table 4 (the four VIX-selected originals) and the 2020
Level-1 circuit breakers (the crash exhibit). They are frozen before any result is
scored — re-picking a window after seeing its numbers is the data-snooping failure
mode the whole study is guarded against — so both the backtest and the live desk
read them from here rather than defining their own.

Config, fixed by the thesis: 5 trading days, 389 observations per window, each with
at least 5 trading days of lead-in ahead of it for the rolling estimate.

**A window is its dates.** The row indices are derived from them at import, not
written down: a pinned integer is a cached answer to "where does 2021-10-08 sit in
this file", and it is only correct for one exact file. Deriving them costs ~50 ms
once per process (about 13% of the `load_prices` call it follows) and buys two
things: the indices cannot drift out of step with the dates, and the same code reads
a bar file that has been trimmed to only the windows it needs — which is how the
public repository ships 3,900 rows instead of 36,270 without forking this module.
"""

from __future__ import annotations

from dataclasses import dataclass, replace

import pandas as pd

from .data import load_prices

WINDOW_BARS = 390  # 5 trading days of 5-minute bars
WINDOW_OBS = 389  # returns within the window (one fewer than bars)


@dataclass(frozen=True)
class Scenario:
    """One evaluation window: an out-of-sample stretch plus its estimation lead-in.

    The three ``*_idx`` fields are filled in at import by :func:`_locate`; the dates
    are the definition. They are ``-1`` only on an unlocated instance, which never
    escapes this module.
    """

    id: str
    role: str
    window_start_date: str  # first bar of the out-of-sample window
    window_end_date: str  # last bar of the out-of-sample window
    lead_in_start_date: str  # first bar of the data pull (>= 5 trading days earlier)
    golden_master: bool  # the crash is exhibit-only and excluded from the golden master
    lead_in_start_idx: int = -1  # row index, resolved from lead_in_start_date
    window_start_idx: int = -1
    window_end_idx: int = -1


# The windows themselves — dates only. Frozen 2026-07-21, before any result was scored.
_WINDOWS: tuple[Scenario, ...] = (
    Scenario("calm", "golden-master + baseline",
             "2021-10-08", "2021-10-14", "2021-10-01", True),
    Scenario("volatile1", "golden-master + baseline",
             "2020-10-23", "2020-10-29", "2020-10-16", True),
    Scenario("volatile2", "golden-master + baseline",
             "2021-01-25", "2021-01-29", "2021-01-15", True),
    Scenario("volatile3", "golden-master + baseline",
             "2021-05-07", "2021-05-13", "2021-04-30", True),
    Scenario("crash", "exhibit only",
             "2020-03-16", "2020-03-20", "2020-03-09", False),
)


def _locate(scenario: Scenario, day: pd.DatetimeIndex) -> Scenario:
    """Resolve one window's three row indices against a bar file's dates.

    ``argmax`` on a boolean index returns the first True — and 0 when there is none,
    which would silently alias a missing window to the top of the file. Each edge is
    therefore checked for presence rather than trusted, so a bar file that does not
    contain a window fails loudly at import instead of scoring the wrong rows.
    """
    lead_from = pd.Timestamp(scenario.lead_in_start_date)
    win_from = pd.Timestamp(scenario.window_start_date)
    win_to = pd.Timestamp(scenario.window_end_date)

    for label, bound, present in (
        ("lead_in_start_date", lead_from, (day >= lead_from).any()),
        ("window_start_date", win_from, (day >= win_from).any()),
        ("window_end_date", win_to, (day <= win_to).any()),
    ):
        if not present:
            raise ValueError(
                f"{scenario.id}: {label} {bound.date()} is outside the bar file "
                f"({day[0].date()} .. {day[-1].date()})"
            )

    return replace(
        scenario,
        lead_in_start_idx=int((day >= lead_from).argmax()),
        window_start_idx=int((day >= win_from).argmax()),
        window_end_idx=int(len(day) - 1 - (day <= win_to)[::-1].argmax()),
    )


def _build(prices: pd.DataFrame | None = None) -> dict[str, Scenario]:
    prices = load_prices() if prices is None else prices
    day = pd.to_datetime(prices.index).normalize()
    return {s.id: _locate(s, day) for s in _WINDOWS}


SCENARIOS: dict[str, Scenario] = _build()

GOLDEN_MASTER_SCENARIOS = [s for s in SCENARIOS.values() if s.golden_master]


def estimation_window(scenario: Scenario, prices: pd.DataFrame | None = None) -> pd.DataFrame:
    """The trailing 390-bar history ending at the window's first observation.

    This is what a golden-master run — and the first step of a backtest roll —
    estimates on: the whole lead-in block ``[lead_in_start_idx, window_start_idx)``.
    """
    prices = load_prices() if prices is None else prices
    return prices.iloc[scenario.lead_in_start_idx : scenario.window_start_idx]


def resolve_indices(prices: pd.DataFrame | None = None) -> dict[str, tuple[int, int, int]]:
    """Every window's ``(lead_in, window_start, window_end)`` row indices.

    Against the default bar file this simply reports what :data:`SCENARIOS` already
    holds. Its remaining job is to answer the same question for a *different* file —
    a trimmed panel, say — and to assert that each window has the shape the thesis
    fixed, which a bad trim would break where a wrong index alone might not show.
    """
    scenarios = SCENARIOS if prices is None else _build(prices)
    resolved: dict[str, tuple[int, int, int]] = {}

    for scenario in scenarios.values():
        span = (
            scenario.lead_in_start_idx,
            scenario.window_start_idx,
            scenario.window_end_idx,
        )
        lead_bars = scenario.window_start_idx - scenario.lead_in_start_idx
        window_bars = scenario.window_end_idx - scenario.window_start_idx + 1
        if lead_bars != WINDOW_BARS:
            raise ValueError(
                f"{scenario.id}: lead-in is {lead_bars} bars, expected {WINDOW_BARS}"
            )
        if window_bars != WINDOW_BARS:
            raise ValueError(
                f"{scenario.id}: window is {window_bars} bars, expected {WINDOW_BARS}"
            )
        resolved[scenario.id] = span
    return resolved
