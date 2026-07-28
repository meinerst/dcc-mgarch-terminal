"""Taylor & Xu (1997) intraday seasonality removal.

Extracted from ``App.ipynb`` -> ``seasonality()``. ``rescale=True`` (default) is
baseline-faithful — it keeps the original global rescale-back-to-magnitude step
(thesis shortcoming 3.1, ERR-01). ``rescale=False`` returns the pure per-slot
standardized returns and is the ``§3.1`` fix seam: the caller re-seasonalizes the
one-step forecast by the *target slot's* factor instead of the global average.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from . import BARS_PER_DAY


def deseasonalize(
    returns: pd.DataFrame, *, rescale: bool = True, bars_per_day: int = BARS_PER_DAY
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Remove intraday seasonality from a return panel.

    Parameters
    ----------
    returns
        Simple returns, one column per asset, time-ordered. This is
        ``prices.pct_change().iloc[1:]`` (first row already dropped).
    rescale
        ``True`` (baseline, ERR-01): rescale the standardized series back to the
        whole-sample return magnitude by one global affine (scale + mean re-inject).
        ``False`` (§3.1 fix): return the pure per-slot standardized returns ``rd``;
        re-seasonalization then happens on the forecast via ``factors``.
    bars_per_day
        Number of intraday bars per trading day (78 for 5-min US-session bars).

    Returns
    -------
    (deseasonalized, factors)
        ``deseasonalized`` has the same shape/index as ``returns``.
        ``factors`` is (bars_per_day x n_assets): the per-slot seasonal scale
        ``sqrt(mean(squared_return))`` used to standardize each intraday slot. It is
        the same object the §3.1 fix uses to re-seasonalize the forecast.
    """
    squared_returns = returns**2

    # 1. Mean squared return per intraday slot (position n, n+78, n+156, ...).
    means = np.vstack(
        [
            squared_returns.iloc[n::bars_per_day, :].mean(axis=0).to_numpy()
            for n in range(bars_per_day)
        ]
    )

    # 2. Divide each slot's returns by its seasonal std (sqrt of mean squared).
    deseasonalized = returns.copy()
    for n in range(bars_per_day):
        deseasonalized.iloc[n::bars_per_day, :] /= np.sqrt(means[n])

    # 3. Baseline only: rescale back to the whole-sample return magnitude by one
    #    global affine (shortcoming 3.1, ERR-01). The §3.1 fix drops this step and
    #    re-seasonalizes the forecast per target slot instead.
    if rescale:
        deseasonalized = returns.mean() + (deseasonalized - deseasonalized.mean()) * (
            returns.std() / deseasonalized.std()
        )

    factors = pd.DataFrame(np.sqrt(means), columns=returns.columns)
    return deseasonalized, factors
