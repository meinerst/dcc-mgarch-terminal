"""Engle (2002) DCC on Gaussian-copula residuals + one-step-ahead forecast.

Extracted from ``App.ipynb`` -> ``DccForecast`` (the ``dcceq`` recursion, the
``loglike_norm_dcc_copula`` objective, and the forecast tail). The original leaned
on module ``global`` state (``Qbar``, ``lastQt``, ``dcceq``); this encapsulates
that state so nothing leaks between runs. Numerically identical to the baseline.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd
from scipy.optimize import minimize


@dataclass
class DccFit:
    a: float
    b: float
    Q_bar: np.ndarray  # (N, N) unconditional covariance of copula residuals
    R_t: np.ndarray  # (N, N, T) conditional-correlation path
    vecl_R_t: np.ndarray  # (T, N*(N-1)/2) lower-triangular path (viz/display)
    R_t_forecast: np.ndarray  # (N, N) one-step-ahead forecast correlation
    last_Qt: np.ndarray  # (N, N) final in-sample Q_t
    asset_names: list[str]
    converged: bool


def _vecl(matrix: np.ndarray) -> np.ndarray:
    """Strictly-lower-triangular entries flattened (drops exact zeros)."""
    lower = np.tril(matrix, k=-1)
    flat = np.asarray(lower).ravel()
    return flat[flat != 0]


def _dcc_recursion(theta: np.ndarray, trdata: np.ndarray):
    """Run the DCC Q/R recursion over the sample.

    ``trdata`` is (T, N) standard-normal copula residuals. Returns
    ``(R_t, vecl_R_t, last_Qt, Q_bar)``. Preserves the original in-place clamp
    when ``a + b`` breaches the stationarity boundary.
    """
    t_obs, n = np.shape(trdata)
    a, b = theta
    if min(a, b) < 0 or max(a, b) > 1 or a + b > 0.999999:
        a = 0.9999 - b

    q_bar = np.cov(trdata.T)
    qt = np.zeros((n, n, t_obs))
    rt = np.zeros((n, n, t_obs))
    qt[:, :, 0] = q_bar
    rt[:, :, 0] = np.corrcoef(trdata.T)

    for j in range(1, t_obs):
        disturbance = np.matmul(trdata[[j - 1]].T, trdata[[j - 1]])
        qt[:, :, j] = q_bar * (1 - a - b) + a * disturbance + b * qt[:, :, j - 1]
        diag = np.sqrt(np.array(np.diag(qt[:, :, j]), ndmin=2))
        rt[:, :, j] = np.divide(qt[:, :, j], np.matmul(diag.T, diag))

    vecl_rt = np.zeros((t_obs, int(n * (n - 1) / 2)))
    for j in range(t_obs):
        vecl_rt[j, :] = _vecl(rt[:, :, j].T)

    return rt, vecl_rt, qt[:, :, -1], q_bar


def _neg_loglike(theta: np.ndarray, trdata: np.ndarray) -> float:
    """Negative Gaussian-copula DCC log-likelihood (Engle 2002, eq. 12)."""
    t_obs, n = np.shape(trdata)
    rt, _, _, _ = _dcc_recursion(theta, trdata)
    llf = np.zeros((t_obs, 1))
    identity = np.eye(n)
    for i in range(t_obs):
        r_i = rt[:, :, i]
        llf[i] = -0.5 * np.log(np.linalg.det(r_i))
        llf[i] -= 0.5 * np.matmul(
            np.matmul(trdata[i, :], (np.linalg.inv(r_i) - identity)), trdata[i, :].T
        )
    return -np.sum(llf)


def _ab_from_unconstrained(u: np.ndarray) -> tuple[float, float]:
    """Map R^2 -> the DCC feasible region (§3.3 robust optimizer).

    ``s = sigmoid(u0)`` is the persistence ``a + b`` in (0, 1); ``w = sigmoid(u1)``
    splits it. So ``a = s*w``, ``b = s*(1-w)`` satisfy ``a, b >= 0`` and
    ``a + b = s < 1`` by construction — the stationarity constraint SLSQP fought at
    the boundary is now structural, so an unconstrained optimizer can be used.
    """
    s = 1.0 / (1.0 + np.exp(-u[0]))
    w = 1.0 / (1.0 + np.exp(-u[1]))
    return float(s * w), float(s * (1.0 - w))


def _unconstrained_from_ab(a: float, b: float) -> np.ndarray:
    """Inverse of :func:`_ab_from_unconstrained` (warm-start the optimizer)."""
    s = a + b
    w = a / s
    return np.array([np.log(s / (1.0 - s)), np.log(w / (1.0 - w))])


def _neg_loglike_reparam(u: np.ndarray, trdata: np.ndarray) -> float:
    return _neg_loglike(np.array(_ab_from_unconstrained(u)), trdata)


def _parse_resid(std_resid: pd.DataFrame | np.ndarray) -> tuple[np.ndarray, list[str]]:
    if isinstance(std_resid, pd.DataFrame):
        asset_names = [str(c).split()[0] for c in std_resid.columns]
        return std_resid.to_numpy(), asset_names
    trdata = np.asarray(std_resid)
    return trdata, [str(i) for i in range(trdata.shape[1])]


def ccc_fit(std_resid: pd.DataFrame | np.ndarray) -> DccFit:
    """Constant Conditional Correlation fallback (§3.3 Tier-1).

    Freezes correlation at the in-sample average (``a = b = 0``): a well-posed
    estimate that always exists. **Understates crash tail risk** — correlation
    cannot spike toward 1 exactly when it does in a crash — so it is operational
    resilience, not the scientific answer; the pipeline flags the result degraded.
    """
    trdata, asset_names = _parse_resid(std_resid)
    t_obs, n = trdata.shape
    r_const = np.corrcoef(trdata.T)
    rt = np.repeat(r_const[:, :, None], t_obs, axis=2)
    vecl_rt = np.tile(_vecl(r_const.T), (t_obs, 1))
    q_bar = np.cov(trdata.T)
    return DccFit(
        a=0.0,
        b=0.0,
        Q_bar=q_bar,
        R_t=rt,
        vecl_R_t=vecl_rt,
        R_t_forecast=r_const,
        last_Qt=q_bar,
        asset_names=asset_names,
        converged=True,
    )


def fit_dcc(
    std_resid: pd.DataFrame | np.ndarray,
    *,
    initial_guess: tuple[float, float] | None = None,
    robust: bool = False,
) -> DccFit:
    """Estimate DCC (a, b) and produce the one-step-ahead forecast correlation.

    Parameters
    ----------
    std_resid
        Standard-normal copula residuals (T, N) — the output of
        ``gaussian_copula_transform``. Time on rows, assets on columns.
    initial_guess
        Warm-start (a, b); defaults to the notebook's (0.01, 0.95).
    robust
        ``False`` (baseline): SLSQP with the original bounds + stationarity
        constraint. ``True`` (§3.3 fix): reparameterize (a, b) into the feasible
        region and optimize unconstrained with L-BFGS-B, removing the boundary
        fragility behind the crash-window SLSQP failures.
    """
    trdata, asset_names = _parse_resid(std_resid)
    n = trdata.shape[1]

    x0 = np.array(initial_guess if initial_guess is not None else [0.01, 0.95])

    if robust:
        u_out = minimize(
            _neg_loglike_reparam,
            _unconstrained_from_ab(*x0),
            args=(trdata,),
            method="L-BFGS-B",
        )
        theta = np.array(_ab_from_unconstrained(u_out.x))
        opt_out = u_out
    else:
        # SLSQP with the original bounds + stationarity constraint (a + b < 1).
        constraints = ({"type": "ineq", "fun": lambda x: -x[0] - x[1] + 1},)
        bounds = ((0.0, 0.5), (0.0, 0.9997))
        opt_out = minimize(_neg_loglike, x0, args=(trdata,), bounds=bounds, constraints=constraints)
        theta = opt_out.x

    a, b = theta

    rt, vecl_rt, last_qt, q_bar = _dcc_recursion(theta, trdata)

    # One-step-ahead forecast. Baseline sets the immediate-disturbance forecast to
    # zero (the a-term drops), matching the original DccForecast tail exactly.
    forecast_disturbance = np.zeros((n, n))
    qt_forecast = q_bar * (1 - a - b) + a * forecast_disturbance + b * last_qt
    qt_forecast = np.reshape(qt_forecast, (n, n))
    diag = np.sqrt(np.array(np.diag(qt_forecast), ndmin=2))
    rt_forecast = np.divide(qt_forecast, np.matmul(diag.T, diag))

    return DccFit(
        a=float(a),
        b=float(b),
        Q_bar=q_bar,
        R_t=rt,
        vecl_R_t=vecl_rt,
        R_t_forecast=rt_forecast,
        last_Qt=last_qt,
        asset_names=asset_names,
        converged=bool(opt_out.success),
    )
