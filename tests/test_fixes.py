"""Proof gates for the §3.1 (re-seasonalize) and §3.4 (drop expected returns) fixes.

The three §3.1 tests are the hard gates pinned in docs/ARCHITECTURE.md §2.6 — a plausible
re-seasonalization without them is not accepted. The §3.4 test certifies that the
expected-returns toggle is a pure mean-translation of the VaR, nothing more.
"""

from __future__ import annotations

from types import SimpleNamespace

import numpy as np
import pandas as pd
import pytest
from backtest.portfolio import SPOTLIGHT

from dccmgarch import DEFAULT_SEED
from dccmgarch.data import load_prices
from dccmgarch.deseasonalize import deseasonalize
from dccmgarch.garch import fit_garch_t
from dccmgarch.pipeline import RETURN_SCALE, _forecast_slot, _reseasonalize_slot
from dccmgarch.portfolio import Portfolio
from dccmgarch.scenarios import GOLDEN_MASTER_SCENARIOS, estimation_window
from dccmgarch.var import mc_var

_CALM = next(s for s in GOLDEN_MASTER_SCENARIOS if s.id == "calm")


def _calm_returns() -> pd.DataFrame:
    window = estimation_window(_CALM, load_prices())
    return window[SPOTLIGHT].pct_change().iloc[1:]


# --------------------------------------------------------------------------- §3.1


def test_rescale_is_scale_only():
    """docs/ARCHITECTURE.md §2.6 (1): the global rescale-back is affine (scale + shift) only, so
    GARCH dynamics are untouched — the bug lives in the forecast scale, never in the
    fit. Two artifact-free parts (a direct two-fit compare is confounded by arch's
    internal auto-rescale of poorly-scaled input):

    (a) the baseline series is exactly an affine of the pure one;
    (b) affine-scaling a GARCH series scales omega by the square and leaves
        alpha/beta/nu invariant."""
    # Any single asset demonstrates an affine identity; this one is the spotlight's
    # first name, taken from the universe rather than written as a literal so the test
    # follows whatever the bar file's columns are called.
    asset = SPOTLIGHT[0]
    returns = _calm_returns()[[asset]]
    pure, _ = deseasonalize(returns, rescale=False)
    glob, _ = deseasonalize(returns, rescale=True)

    # (a) rescale=True is literally the dropped affine of rescale=False.
    c = float(returns[asset].std() / pure[asset].std())
    reconstructed = returns[asset].mean() + (pure[asset] - pure[asset].mean()) * c
    np.testing.assert_allclose(glob[asset].to_numpy(), reconstructed.to_numpy(), rtol=1e-9)

    # (b) GARCH scaling law on one well-conditioned series and its scaled copy (both
    # kept in arch's happy range so no internal rescale confounds the comparison).
    base = (pure[asset] / pure[asset].std() * 10.0).dropna()  # std 10 -> well scaled
    scale = 3.0
    fit_base = fit_garch_t(base)
    fit_scaled = fit_garch_t(base * scale)  # std 30 -> still well scaled

    assert fit_scaled.alpha == pytest.approx(fit_base.alpha, rel=2e-2)
    assert fit_scaled.beta == pytest.approx(fit_base.beta, rel=2e-2)
    # nu is near-unidentified when the fitted tail is ~Gaussian (large nu): the
    # log-likelihood is flat in nu, so the optimizer lands anywhere on that ridge
    # (here ~210 vs ~460) with no scientific difference, and the exact value shifts
    # with the scipy/arch build. The invariant that actually carries meaning is the
    # tail HEAVINESS 1/nu (the tail index), which is well-conditioned: both fits are
    # ~Gaussian (1/nu ~ 0), and a real regression to a genuinely heavy tail (single-
    # digit nu -> 1/nu ~ 0.1-0.2) would blow past this atol.
    assert 1.0 / fit_scaled.nu == pytest.approx(1.0 / fit_base.nu, abs=2e-2)
    assert fit_scaled.omega / fit_base.omega == pytest.approx(scale**2, rel=2e-2)


def test_reseasonalize_recovers_truth():
    """docs/ARCHITECTURE.md §2.6 (2): on a synthetic panel with a KNOWN seasonal factor and
    constant true vol, the fixed path recovers the slot-conditional variance while
    the baseline collapses to one flat whole-sample scale. Ground-truth, noise-free."""
    bars_per_day = 4
    seasonal = np.array([0.5, 1.0, 2.0, 4.0])  # known S per intraday slot
    rng = np.random.default_rng(0)
    n_days = 4000
    eps = rng.standard_normal(n_days * bars_per_day)  # constant unit true vol
    slots = np.tile(np.arange(bars_per_day), n_days)
    series = seasonal[slots] * eps
    returns = pd.DataFrame({"X": series})

    _, factors = deseasonalize(returns, rescale=False, bars_per_day=bars_per_day)
    recovered = factors["X"].to_numpy()
    # factors == sqrt(mean squared) per slot ≈ S_n (unit true vol) up to sampling.
    np.testing.assert_allclose(recovered, seasonal, rtol=0.05)

    # Fixed forecast variance tracks the target slot; baseline is flat (mean scale).
    pure_forecast = 1.0  # standardized rd has unit forecast variance
    fixed = np.array([_reseasonalize_slot(pure_forecast, s) for s in recovered])
    flat = float(np.mean(recovered**2))
    assert fixed.min() < flat < fixed.max()  # slot-varying, not flat
    assert fixed[3] / fixed[0] == pytest.approx((seasonal[3] / seasonal[0]) ** 2, rel=0.1)


def test_seasonality_and_mean_orthogonal():
    """docs/ARCHITECTURE.md §2.6 (3): the mean re-injection is governed ONLY by
    include_expected_returns, never smuggled back by the seasonality path."""
    returns = _calm_returns()
    glob, _ = deseasonalize(returns, rescale=True)
    pure, _ = deseasonalize(returns, rescale=False)

    # Baseline rescale re-injects returns.mean(); the fixed (pure) path does not.
    np.testing.assert_allclose(glob.mean().to_numpy(), returns.mean().to_numpy(), atol=1e-12)
    assert not np.allclose(pure.mean().to_numpy(), returns.mean().to_numpy(), atol=1e-9)

    # And VaR ignores the mean entirely when include_expected_returns is off, so the
    # seasonality path (which never touches mean) cannot re-introduce it.
    port, dcc, garch = _toy_var_inputs()
    kw = dict(seed=DEFAULT_SEED, return_scale=RETURN_SCALE, include_expected_returns=False)
    v_a = mc_var(port, dcc, garch, mean_returns=np.array([0.01, 0.02]), **kw).var
    v_b = mc_var(port, dcc, garch, mean_returns=np.array([-0.05, 0.09]), **kw).var
    assert v_a == v_b


def test_forecast_slot_wraps():
    """The one-step forecast lands in the slot after the last return row."""
    assert _forecast_slot(0, bars_per_day=78) == 0
    assert _forecast_slot(77, bars_per_day=78) == 77
    assert _forecast_slot(78, bars_per_day=78) == 0
    assert _forecast_slot(80, bars_per_day=78) == 2


# --------------------------------------------------------------------------- §3.4


def _toy_var_inputs():
    """Minimal duck-typed inputs for mc_var (2 assets, long-only)."""
    r_forecast = np.array([[1.0, 0.3], [0.3, 1.0]])
    dcc = SimpleNamespace(R_t_forecast=r_forecast)
    garch = [
        SimpleNamespace(forecast_variance=2.0, nu=8.0),
        SimpleNamespace(forecast_variance=3.0, nu=8.0),
    ]
    port = Portfolio(
        shares=pd.Series({"A": 100.0, "B": 80.0}),
        prices=pd.Series({"A": 10.0, "B": 20.0}),
    )
    return port, dcc, garch


def test_drop_expected_returns_is_mean_translation():
    """§3.4/ERR-02: including expected returns only translates every simulated
    portfolio value by a fixed drift, so it shifts the VaR by exactly that drift —
    the diversification-effect bug (Fig 12 / p.35)."""
    port, dcc, garch = _toy_var_inputs()
    mean = np.array([0.0005, 0.0005])
    kw = dict(seed=DEFAULT_SEED, return_scale=RETURN_SCALE, mean_returns=mean)

    v_with = mc_var(port, dcc, garch, include_expected_returns=True, **kw).var
    v_without = mc_var(port, dcc, garch, include_expected_returns=False, **kw).var

    drift = float(np.sum(port.shares.to_numpy() * port.prices.to_numpy() * mean))
    assert v_with != v_without
    assert abs(v_with - v_without) == pytest.approx(abs(drift), abs=0.03)


def test_expected_shortfall_dominates_var():
    """ES is the mean of the tail `var` only bounds, so it can never be the smaller
    number. Pinned as an invariant rather than a golden value: `var` is unchanged by
    this addition (same draws, same seed), so the golden references stay untouched."""
    port, dcc, garch = _toy_var_inputs()
    result = mc_var(
        port, dcc, garch, seed=DEFAULT_SEED, return_scale=RETURN_SCALE,
        include_expected_returns=False,
    )

    assert np.isfinite(result.es)
    assert result.es > result.var
