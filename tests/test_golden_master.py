"""Golden-master regression: the seeded baseline core must not drift.

These pin the refactored core's numeric output under a fixed seed on the 4 working
scenarios (crash is exhibit-only, excluded). This is a self-consistency lock, not a
match to thesis Table 6 — the original was unseeded and never reproducible
(Planning.md guardrail). The relative tolerance absorbs BLAS/platform noise
without going green on a real regression.

RTOL history / structure: the goldens were baked bit-tight (1e-6) on the
reference machine. A cross-machine audit (REPRODUCIBILITY.md) showed 1e-6 — and
even the ~1e-3 first proposed off a calm-only measurement — fails everywhere but
that PC, and that the drift splits sharply by quantity:

  * Observable outputs (VaR, spotlight correlations) are well-conditioned: they
    drift only 0.09-0.51 % (VaR worst 5.1e-3; corr worst 1.1e-3) — pure
    BLAS/LAPACK-build + MLE-optimizer noise on byte-identical code. These are
    pinned tight at RTOL = 1e-2: ~2x above the worst noise, yet ~25x below the
    smallest real regression signal (the 26 % GARCH break in REPRODUCIBILITY.md).

  * The DCC scalar params (a, b) and the average marginal nu are weakly identified
    and NOT reproducible cross-machine — b drifts up to 85 % and nu 15-31 % in
    low-persistence windows,
    where they sit on flat likelihood ridges — while the correlation path they
    produce stays stable. They are guarded coarsely (not pinned); see the body.

So `git clone && pytest` is green on any machine while a genuine drift still trips.
"""

from __future__ import annotations

import json

import numpy as np
import pytest

from _golden_helpers import GOLDEN_DIR, run_scenario
from dccmgarch.scenarios import GOLDEN_MASTER_SCENARIOS

RTOL = 1e-2  # cross-machine BLAS + MLE-optimizer noise; see module docstring


def _load(scenario_id: str) -> dict:
    return json.loads((GOLDEN_DIR / f"{scenario_id}.json").read_text())


@pytest.mark.parametrize("scenario", GOLDEN_MASTER_SCENARIOS, ids=lambda s: s.id)
def test_golden_master(scenario):
    expected = _load(scenario.id)
    result = run_scenario(scenario)

    exp_dcc = expected["dcc_params"]

    # Observable model outputs — well-conditioned, so pinned tight (RTOL). These are
    # what the desk actually shows and what a real regression moves; cross-machine
    # they drift only sub-1 % (VaR <=5.1e-3, spotlight corr <=1.1e-3).
    assert result.converged == expected["converged"]
    assert result.var == pytest.approx(expected["var"], rel=RTOL)
    np.testing.assert_allclose(
        result.corr_spotlight, expected["corr_spotlight"], rtol=RTOL, atol=1e-3
    )

    # DCC scalar params are weakly identified: in low-persistence windows (volatile3,
    # a+b~0.03) the persistence b and the marginal d.o.f. nu sit on flat likelihood
    # ridges and are NOT reproducible across machines (b drifts up to 85 %, nu 15-31 %;
    # see REPRODUCIBILITY.md) even though the correlation path they produce is stable.
    # So guard them coarsely against gross breakage rather than pinning them — the
    # observable outputs above are the real lock. nu is checked via its well-behaved
    # tail index 1/nu (nu itself is near-unidentified once the fitted tail is ~Gaussian).
    assert result.dcc_params["a"] == pytest.approx(exp_dcc["a"], abs=0.03)
    assert result.dcc_params["b"] == pytest.approx(exp_dcc["b"], abs=0.03)
    assert 1.0 / result.dcc_params["nu_marginal_avg"] == pytest.approx(
        1.0 / exp_dcc["nu_marginal_avg"], abs=2e-2
    )


def test_scenario_indices_match_dates():
    """The pinned row indices still resolve from the scenario dates."""
    from dccmgarch.scenarios import resolve_indices

    resolve_indices()  # raises on drift
