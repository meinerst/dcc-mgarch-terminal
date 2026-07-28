"""§3.3 crash-convergence: halt detector, robust optimizer, CCC fallback.

The integration test is the money-shot — the model that could not run on the 2020
crash (thesis §7.1.3, SLSQP failure) now produces a well-posed estimate there.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest
from backtest.portfolio import SPOTLIGHT, build_portfolio

from dccmgarch.data import load_prices
from dccmgarch.dcc import _ab_from_unconstrained, _unconstrained_from_ab, ccc_fit
from dccmgarch.halts import detect_halts
from dccmgarch.pipeline import FixConfig, one_step_var
from dccmgarch.scenarios import SCENARIOS, estimation_window

# --------------------------------------------------------------------------- halts


def test_detect_halts_flags_runs_not_singletons():
    prices = pd.DataFrame(
        {"A": [10, 10, 10, 10, 11, 12], "B": [5, 6, 6, 7, 8, 9]}  # A: run of 3; B: single
    )
    mask = detect_halts(prices, min_run_length=2)
    assert mask["A"].tolist() == [False, True, True, True, False, False]
    assert not mask["B"].any()  # an isolated unchanged bar is noise, not a halt


def test_detect_halts_uses_zero_volume():
    prices = pd.DataFrame({"A": [10, 11, 12, 13], "B": [5, 6, 7, 8]})
    volume = pd.DataFrame({"A": [100, 0, 100, 100], "B": [1, 1, 1, 1]})
    mask = detect_halts(prices, volume, min_run_length=2)
    assert mask["A"].tolist() == [False, True, False, False]  # zero-vol bar, price moved


# --------------------------------------------------------------- robust reparam


def test_reparam_stays_in_feasible_region():
    """a, b >= 0 and a + b < 1 for ANY point in R^2 — the constraint is structural."""
    grid = np.linspace(-12, 12, 25)
    for u0 in grid:
        for u1 in grid:
            a, b = _ab_from_unconstrained(np.array([u0, u1]))
            assert a >= 0.0 and b >= 0.0
            assert a + b < 1.0


def test_reparam_roundtrip():
    for a, b in [(0.01, 0.95), (0.05, 0.90), (0.2, 0.7)]:
        a2, b2 = _ab_from_unconstrained(_unconstrained_from_ab(a, b))
        assert a2 == pytest.approx(a, rel=1e-9)
        assert b2 == pytest.approx(b, rel=1e-9)


# --------------------------------------------------------------------- CCC fallback


def test_ccc_fit_freezes_correlation():
    rng = np.random.default_rng(0)
    resid = pd.DataFrame(rng.standard_normal((200, 3)), columns=SPOTLIGHT)
    fit = ccc_fit(resid)

    assert fit.a == 0.0 and fit.b == 0.0
    assert fit.converged
    sample_corr = np.corrcoef(resid.to_numpy().T)
    np.testing.assert_allclose(fit.R_t_forecast, sample_corr)
    # every conditional-correlation slice is the same constant matrix.
    np.testing.assert_allclose(fit.R_t[:, :, 0], fit.R_t[:, :, -1])


def test_robust_optimizer_matches_baseline_on_calm():
    """On a well-behaved window the reparameterized fit should land at essentially
    the same (a, b) as SLSQP — the fix changes conditioning, not the optimum."""
    calm = next(s for s in SCENARIOS.values() if s.id == "calm")
    window = estimation_window(calm, load_prices())
    port = build_portfolio(window)
    base = one_step_var(window, port)
    robust = one_step_var(window, port, fixes=FixConfig(robust_optimizer=True))
    assert robust.converged
    assert robust.dcc_params["a"] == pytest.approx(base.dcc_params["a"], abs=5e-3)
    assert robust.dcc_params["b"] == pytest.approx(base.dcc_params["b"], abs=5e-3)


# ------------------------------------------------------------------- money-shot


def test_crash_window_converges_with_fixes():
    """The exhibit: on the 2020 crash lead-in the fixed model produces a well-posed,
    finite VaR (the original fails here — thesis §7.1.3)."""
    crash = SCENARIOS["crash"]
    window = estimation_window(crash, load_prices())
    port = build_portfolio(window)

    # Halts really are present in this window (validates the detector fires here).
    assert detect_halts(window[SPOTLIGHT]).to_numpy().any()

    fixes = FixConfig(mask_halts=True, robust_optimizer=True, fallback_ccc_on_fail=True)
    result = one_step_var(window, port, fixes=fixes)

    assert result.converged
    assert np.isfinite(result.var) and result.var > 0
