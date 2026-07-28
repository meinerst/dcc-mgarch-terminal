"""Monte-Carlo one-step-ahead Value-at-Risk (Student-t innovations, DCC covariance).

Extracted from ``App.ipynb`` -> ``portfolioVaR``. The only stochastic call in the
whole core lives here, so this is the single place a ``seed`` is threaded.
The original used bare, unseeded ``np.random.standard_t``; the
seeded ``default_rng`` here is the intended replacement — the golden master pins
*this* seeded output (the original numbers were never reproducible).
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from . import DEFAULT_SEED
from .dcc import DccFit
from .portfolio import Portfolio


@dataclass
class McVarResult:
    """One MC pass, read twice: the VaR quantile and the mean of the tail behind it.

    ``es`` costs nothing extra — the simulated portfolio values are already in hand
    and the original discarded everything but a single quantile. Same draws, same
    seed, so ``var`` is bit-identical to what the golden master pins.
    """

    var: float
    es: float


def _forecast_covariance(dcc_fit: DccFit, garch_fits: list, return_scale: float) -> np.ndarray:
    """Assemble H_t = D_t R_t D_t in original return units.

    ``garch_fits`` forecast variances are in the optimizer's scaled space
    (returns were multiplied by ``return_scale`` before fitting); dividing H_t by
    ``return_scale**2`` brings it back to native return units, as the notebook did.
    """
    fcast_vars = np.array([g.forecast_variance for g in garch_fits])
    d_t = np.sqrt(np.diag(fcast_vars))
    h_t = np.matmul(np.matmul(d_t, dcc_fit.R_t_forecast), d_t)
    return h_t / (return_scale**2)


def forecast_sigma(garch_fits: list, return_scale: float) -> np.ndarray:
    """Per-asset one-step-ahead forecast std dev, in native return units.

    Exactly ``sqrt(diag(H_t))`` as assembled by ``_forecast_covariance``: ``R_t`` has a
    unit diagonal, so ``diag(D R D) == diag(D)**2`` and the matmul is unnecessary. Kept
    public (and beside the covariance it agrees with) because the demo decomposes the
    portfolio VaR per name and needs the marginal volatilities the covariance hides.
    """
    fcast_vars = np.array([g.forecast_variance for g in garch_fits])
    return np.sqrt(fcast_vars) / return_scale


def mc_var(
    portfolio: Portfolio,
    dcc_fit: DccFit,
    garch_fits: list,
    *,
    n_sims: int = 5000,
    alpha: float = 0.05,
    seed: int = DEFAULT_SEED,
    mean_returns: np.ndarray | None = None,
    include_expected_returns: bool = True,
    margin_requirement: float = 0.0,
    return_scale: float = 1.0,
) -> McVarResult:
    """One-step-ahead 95% Monte-Carlo VaR (and its Expected Shortfall) in dollars.

    Parameters
    ----------
    portfolio
        The :class:`Portfolio` (positions + prices). The MC-VaR weighting is read
        from ``portfolio.weights``, so the exposure/weight provenance is explicit.
    dcc_fit, garch_fits
        Forecast correlation and per-asset variance forecasts; combined into H_t.
    mean_returns
        Per-asset expected return in native units, aligned to the portfolio. Only
        used when ``include_expected_returns`` is True (baseline).
    include_expected_returns
        Baseline True. FixConfig sets this False for the diversification fix
        (shortcoming 3.1/3.4).
    margin_requirement
        Fractional margin inflating short exposure (0.0 = none).
    return_scale
        Scale factor the returns were multiplied by before GARCH/DCC fitting
        (1000 in the notebook); used to convert H_t back to native units.
    """
    n_assets = len(portfolio.tickers)

    shares = portfolio.shares.to_numpy()
    prices = portfolio.prices.to_numpy()

    # Inflate short positions by the margin requirement (original bool_ind branch).
    short = shares < 0
    shares = np.where(short, shares * (1 + margin_requirement), shares)

    # Single portfolio-level ddof: exposure-weighted average of univariate nus.
    asset_weights = portfolio.weights.to_numpy()
    nus = np.array([g.nu for g in garch_fits])
    ddof_weighted = np.round(np.sum(asset_weights * nus), 3)

    cov = _forecast_covariance(dcc_fit, garch_fits, return_scale)

    last_port_value = float(np.sum(prices * shares))

    try:
        cholesky = np.linalg.cholesky(cov)
    except np.linalg.LinAlgError:
        # Original behavior: non-positive-definite covariance -> VaR unavailable.
        print("Covariance matrix for MCM is not positive definite")
        return McVarResult(var=0.0, es=0.0)

    rng = np.random.default_rng(seed)
    draw = rng.standard_t(ddof_weighted, size=(n_assets, n_sims))
    corr_draw = np.matmul(cholesky, draw)

    if include_expected_returns:
        if mean_returns is None:
            raise ValueError("mean_returns required when include_expected_returns=True")
        mean_col = np.reshape(np.asarray(mean_returns), (n_assets, 1))
        corr_draw = mean_col + corr_draw

    gross = 1 + corr_draw
    stock_prices = (gross.T * prices).T
    stock_exposures = (stock_prices.T * shares).T
    port_values = stock_exposures.sum(axis=0)

    confidence_alpha = np.quantile(port_values, alpha)
    value_at_risk = float(np.abs(confidence_alpha - last_port_value))

    # Expected Shortfall: the mean outcome *inside* the tail the quantile only bounds.
    # 95% VaR is consistent with a tail averaging anything beyond it, so this is what
    # makes the Student-t tail shape observable. `es >= var` by construction. The
    # quantile can interpolate between order statistics, so the mask can only ever be
    # empty for a degenerate sample; fall back to the quantile itself there.
    tail = port_values[port_values <= confidence_alpha]
    tail_mean = float(tail.mean()) if tail.size else float(confidence_alpha)
    expected_shortfall = float(np.abs(tail_mean - last_port_value))

    return McVarResult(var=round(value_at_risk, 2), es=round(expected_shortfall, 2))
