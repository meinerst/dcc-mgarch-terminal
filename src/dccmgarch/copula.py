"""Gaussian-copula transform: uniform PIT residuals -> standard-normal marginals.

Extracted from ``App.ipynb`` (the ``norm.ppf(udata)`` step feeding the DCC
log-likelihood). Isolating it here is what makes the copula choice swappable later
(shortcoming 3.6: t-copula), without touching the DCC recursion.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from scipy.stats import norm

# §3.3 numerical guard (opt-in). In a crash window the Student-t PIT (``garch.udata``)
# saturates to exactly 0.0/1.0 in float64 for limit-move standardized residuals, and
# ``norm.ppf`` maps those to +/-inf -> every downstream correlation is non-finite ->
# NaN VaR. This is dimension-dependent: at N=30 almost always some asset saturates in
# the breaker week, at N=3 rarely (why N=3 survives). Bounding the PIT away from {0, 1}
# caps the normal-space residual (``norm.ppf(1 - 1e-6) ~= 4.75``) and is a no-op wherever
# the PIT is already interior. Empirically insensitive: VaR moves <2.5% across
# eps in [1e-3, 1e-8]. Off by default so baseline / golden-master numbers are unchanged.
PIT_GUARD_EPS = 1e-6  # clamp udata into [eps, 1 - eps] before norm.ppf
RESID_WINSOR = 8.0  # belt-and-suspenders cap on |normal-space residual| (sigma)


def gaussian_copula_transform(
    udata: pd.DataFrame | np.ndarray,
    *,
    clip_eps: float | None = None,
    winsor: float | None = None,
) -> np.ndarray:
    """Map uniform (0, 1) PIT data to standard-normal copula marginals.

    Parameters
    ----------
    udata
        Uniform PIT residuals shaped (n_obs, n_assets) — time on rows.
    clip_eps
        If set, clamp ``udata`` into ``[clip_eps, 1 - clip_eps]`` before ``norm.ppf``
        so a saturated PIT (0.0/1.0) cannot map to +/-inf. ``None`` (default) is the
        baseline-faithful path — no clamping, bit-identical to the original.
    winsor
        If set, clip the resulting normal-space residuals to ``[-winsor, winsor]`` and
        replace any remaining non-finite value with the signed cap. A downstream safety
        net for ``clip_eps``; ``None`` (default) leaves the output untouched.

    Returns
    -------
    Standard-normal residuals, same shape, ready for the DCC recursion.
    """
    values = udata.to_numpy() if isinstance(udata, pd.DataFrame) else np.asarray(udata)
    if clip_eps is not None:
        values = np.clip(values, clip_eps, 1.0 - clip_eps)
    resid = norm.ppf(values)
    if winsor is not None:
        resid = np.nan_to_num(resid, nan=0.0, posinf=winsor, neginf=-winsor)
        resid = np.clip(resid, -winsor, winsor)
    return resid
