"""One seeded run of the pinned portfolio — the golden master's single definition.

Used by both ``generate_golden.py`` (which writes the references) and
``test_golden_master.py`` (which checks against them), so the two cannot drift.

The portfolio is the backtest's own spotlight builder rather than a copy of it: the
golden VaR and the first step of a backtest roll are meant to be the same number, and
that only holds if they are the same book.
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd
from backtest.portfolio import build_portfolio

from dccmgarch import DEFAULT_SEED
from dccmgarch.data import load_prices
from dccmgarch.pipeline import one_step_var
from dccmgarch.scenarios import Scenario, estimation_window

GOLDEN_DIR = Path(__file__).resolve().parent / "golden"


def run_scenario(scenario: Scenario, prices: pd.DataFrame | None = None):
    """The deterministic ``one_step_var`` a scenario's references were baked from."""
    prices = load_prices() if prices is None else prices
    window = estimation_window(scenario, prices)
    return one_step_var(window, build_portfolio(window), seed=DEFAULT_SEED)
