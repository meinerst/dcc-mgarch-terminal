"""Trading-halt detector (shortcoming 3.3 root-cause fix — the detector only).

A circuit-breaker halt is *no trading* = missing data, not a zero return. This
flags halted bars programmatically (zero-volume, or zero-return runs), to be
validated against the known 2020 Level-1 breaker dates — the detector is the general
mechanism and the known dates are its test set, never the driver.

The detector is deliberately NOT wired into the baseline pipeline: masking is itself
a before/after delta, so it lives on the fix side (``FixConfig.mask_halts``).
"""

from __future__ import annotations

import numpy as np
import pandas as pd


def detect_halts(
    prices: pd.DataFrame,
    volume: pd.DataFrame | None = None,
    *,
    min_run_length: int = 2,
) -> pd.DataFrame:
    """Boolean mask (True = halted bar), aligned to ``prices``.

    A bar is flagged when volume is zero, or when it sits inside a run of
    unchanged prices (zero returns) of length >= ``min_run_length`` — a single
    flat bar is noise, a sustained run is a halt.

    Parameters
    ----------
    prices
        Price panel, time on rows, assets on columns.
    volume
        Matching volume panel (optional). Zero-volume bars are flagged directly.
    min_run_length
        Minimum consecutive-unchanged-price run to treat as a halt.
    """
    unchanged = prices.diff() == 0
    halted = _runs_at_least(unchanged, min_run_length)

    if volume is not None:
        zero_vol = volume.reindex_like(prices) == 0
        halted = halted | zero_vol

    return halted.fillna(False)


def _runs_at_least(flags: pd.DataFrame, min_run_length: int) -> pd.DataFrame:
    """Keep True only where it belongs to a consecutive run of length >= min."""
    if min_run_length <= 1:
        return flags

    out = np.zeros(flags.shape, dtype=bool)
    values = flags.to_numpy()
    for col in range(values.shape[1]):
        run_start = 0
        column = values[:, col]
        for row in range(len(column) + 1):
            if row < len(column) and column[row]:
                continue
            if row - run_start >= min_run_length:
                out[run_start:row, col] = True
            run_start = row + 1
    return pd.DataFrame(out, index=flags.index, columns=flags.columns)
