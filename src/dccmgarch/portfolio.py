"""Portfolio state: positions, weights, P&L.

Extracted from the ``df_positions`` bookkeeping in ``App.ipynb``. This is the
weight-bearing object the contract refers to as ``portfolio``: it carries the signed
share count and last prices the dollar VaR needs, plus derived exposure/weights.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd


@dataclass
class Portfolio:
    """A portfolio of positions keyed by ticker.

    Parameters
    ----------
    shares
        Signed share count per ticker (negative = short).
    prices
        Last market price per ticker (same index as ``shares``).
    pnl
        Optional floating P/L per ticker; defaults to zeros.
    """

    shares: pd.Series
    prices: pd.Series
    pnl: pd.Series | None = None

    def __post_init__(self):
        self.shares = self.shares.astype(float)
        self.prices = self.prices.reindex(self.shares.index).astype(float)
        if self.pnl is None:
            self.pnl = pd.Series(0.0, index=self.shares.index)

    @property
    def tickers(self) -> list[str]:
        return list(self.shares.index)

    @property
    def exposure(self) -> pd.Series:
        """Signed dollar exposure per ticker (shares × price)."""
        return self.shares * self.prices

    @property
    def weights(self) -> pd.Series:
        """Absolute-exposure weights (sum to 1); the VaR ddof weighting.

        Derived from the portfolio's own exposure, so ``portfolio.weights`` makes
        the provenance explicit: weights come *from* the portfolio, never the reverse.

        Flat-book guard: a portfolio with zero total exposure (e.g. the Option P
        demo before any order arrives) has no exposure to weight, so ``0/0`` would
        be NaN. Fall back to uniform weights there — the exposure-weighted ddof
        average stays finite and the VaR itself works out to zero regardless.
        """
        abs_exposure = self.exposure.abs()
        total = abs_exposure.sum()
        if total == 0:
            return pd.Series(1.0 / len(abs_exposure), index=abs_exposure.index)
        return abs_exposure / total

    @property
    def total_pnl(self) -> float:
        return float(np.asarray(self.pnl).sum())
