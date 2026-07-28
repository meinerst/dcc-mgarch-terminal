"""Univariate GARCH(1,1) with Student-t innovations, plus the PIT to uniform data.

Extracted from ``App.ipynb`` -> ``run_garch_on_return()`` / ``garch_t_to_u()``.
Baseline-faithful: reproduces the original numeric behavior exactly, including one
preserved quirk (see ``_pit_to_uniform``) that later shows up as a measured delta.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd
from arch import arch_model
from scipy.stats import t as student_t


@dataclass
class GarchFit:
    """Result of a single-asset GARCH(1,1)-t fit."""

    omega: float
    alpha: float
    beta: float
    nu: float  # Student-t degrees of freedom (the DDOF the VaR draw uses)
    mu: float
    sigma2: np.ndarray  # conditional variance path
    forecast_variance: float  # 1-step-ahead conditional variance (arch 'h.1')
    udata: np.ndarray  # PIT residuals in (0, 1) via the Student-t CDF
    pvalues: dict = field(default_factory=dict)  # for terminal display only


def _pit_to_uniform(returns: pd.Series, res, mu: float, nu: float) -> np.ndarray:
    """Probability-integral-transform standardized residuals to uniform (0, 1).

    NOTE (preserved original quirk): the standardized residual is divided by
    ``sqrt(conditional_volatility)``. ``arch``'s ``conditional_volatility`` is
    already the conditional standard deviation, so the dimensionally correct form
    is ``residual / conditional_volatility``. This preserves the original
    ``/ sqrt(...)`` so the golden master pins true baseline behavior; correcting it
    is a later 'optimize' pass logged as a before/after delta (findings_log.md).
    """
    est_residuals = returns - mu
    cond_vol = res.conditional_volatility
    std_residuals = est_residuals / np.sqrt(cond_vol)
    return student_t.cdf(std_residuals, nu)


def fit_garch_t(returns: pd.Series) -> GarchFit:
    """Fit GARCH(1,1) with a constant mean and Student-t innovations.

    ``returns`` is a single asset's (deseasonalized, scaled) return series.
    """
    model = arch_model(returns, dist="t", p=1, q=1)
    res = model.fit(disp="off")

    mu = res.params["mu"]
    omega = res.params["omega"]
    alpha = res.params["alpha[1]"]
    beta = res.params["beta[1]"]
    nu = res.params["nu"]

    forecast_variance = res.forecast(horizon=1, reindex=False).variance["h.1"].iloc[0]
    udata = _pit_to_uniform(returns, res, mu, nu)

    return GarchFit(
        omega=omega,
        alpha=alpha,
        beta=beta,
        nu=nu,
        mu=mu,
        sigma2=np.asarray(res.conditional_volatility) ** 2,
        forecast_variance=float(forecast_variance),
        udata=np.asarray(udata),
        pvalues={
            "omega": float(res.pvalues["omega"]),
            "alpha": float(res.pvalues["alpha[1]"]),
            "beta": float(res.pvalues["beta[1]"]),
            "nu": float(res.pvalues["nu"]),
        },
    )
