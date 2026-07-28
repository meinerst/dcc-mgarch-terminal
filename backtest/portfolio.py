"""The two pinned backtest portfolios.

The backtest scores *the model*, so its portfolios are frozen: before/after deltas
are only apples-to-apples if the book does not move between grinds. Two coexist,
each answering a different question — see the builders below.

The original ``candidateportfolio.csv`` (the 30-asset random portfolio behind thesis
Table 6) was not recovered with the legacy project, and the original run was
unseeded, so exact Table-6 hit counts are unreproducible either way. These pinned
portfolios are the yardstick instead.
"""

from __future__ import annotations

import pandas as pd

from dccmgarch.data import UNIVERSE
from dccmgarch.portfolio import Portfolio

# --- 3-asset spotlight: the methodology yardstick --------------------------------
# Long-only, same names and shares the golden master pins, so the first rolling step
# reproduces the golden VaR exactly (a free self-check). The scoring claims it
# carries — conditional coverage, the expected-returns delta — live in the scalar hit
# sequence, which is dimension-invariant, so three names are enough for them.
#
# Identified by POSITION in the universe, not by symbol: the bar files are the single
# source of truth for the names (see data._read_universe), so a hardcoded symbol here
# would be a second copy that can disagree with them. Positions 19/14/22 are the three
# the golden masters were baked on.
SPOTLIGHT_INDICES = (19, 14, 22)
SPOTLIGHT = [UNIVERSE[i] for i in SPOTLIGHT_INDICES]
SPOTLIGHT_SHARES = dict(zip(SPOTLIGHT, (100.0, 150.0, 200.0), strict=True))

# --- 30-asset stress book: the crash/robustness exhibit ---------------------------
# Equal *dollar* exposure across the whole investable universe. Fractional shares
# (dollars / price) make the weight vector exactly flat, so any correlation-matrix
# degeneracy comes from the correlations and not from the sizing; the dollar level
# only scales VaR linearly and touches neither convergence nor conditioning.
#
# The universe is the whole Dow-30, deliberately: hand-picking collinear names would
# engineer the very failure the exhibit claims to have found. A 3x3 correlation matrix
# stays invertible, so the spotlight structurally cannot exercise the |R_t| -> 0
# pathology this book targets.
STRESS_DOLLARS_PER_NAME = 10_000.0


def build_portfolio(window: pd.DataFrame) -> Portfolio:
    """The 3-asset spotlight, marked at the last bar of the estimation ``window``."""
    last_prices = window[SPOTLIGHT].iloc[-1]
    shares = pd.Series(SPOTLIGHT_SHARES, dtype=float).reindex(SPOTLIGHT)
    return Portfolio(shares=shares, prices=last_prices)


def build_stress_portfolio(window: pd.DataFrame) -> Portfolio:
    """The equal-dollar 30-name book, marked at the last bar of the ``window``."""
    last_prices = window[UNIVERSE].iloc[-1]
    shares = STRESS_DOLLARS_PER_NAME / last_prices.astype(float)
    return Portfolio(shares=shares, prices=last_prices)
