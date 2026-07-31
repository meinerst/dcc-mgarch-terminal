"""Univariate GARCH(1,1) with Student-t innovations, plus the PIT to uniform data.

Extracted from ``App.ipynb`` -> ``run_garch_on_return()`` / ``garch_t_to_u()``.
Structure is baseline-faithful; the PIT itself is not — the original's residual
standardization and Student-t parameterization were both wrong (see ``_pit_to_uniform``).
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

    Two corrections over the original, both load-bearing for everything downstream —
    a mis-standardized PIT is not uniform, so `Q_bar`, the DCC path and the forecast
    correlation are all estimated on the wrong marginals:

    * ``arch``'s ``conditional_volatility`` is ALREADY the conditional standard
      deviation, so the residual is divided by it, not by its square root (the
      original's ``/ sqrt(...)`` also left a stray ``sqrt(scale)`` in the transform,
      so it was not even scale-invariant).
    * ``arch`` fits a Student-t standardized to UNIT variance; SciPy's ``t`` has
      variance ``nu / (nu - 2)``. The standardized residual is rescaled by
      ``sqrt(nu / (nu - 2))`` so the CDF applied here is the distribution the
      likelihood was actually maximized under.
    """
    est_residuals = returns - mu
    std_residuals = est_residuals / res.conditional_volatility
    return student_t.cdf(std_residuals * np.sqrt(nu / (nu - 2.0)), nu)


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
