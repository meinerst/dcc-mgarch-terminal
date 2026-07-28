# The model, and the interfaces you will touch

Enough to work with this code without reading all of it. The source is the authority
where the two disagree.

## One entry point

```python
from dccmgarch.pipeline import one_step_var, FixConfig
from dccmgarch.scenarios import SCENARIOS, estimation_window
from backtest.portfolio import build_portfolio

window = estimation_window(SCENARIOS["calm"])
result = one_step_var(window, build_portfolio(window), seed=20220101)
print(result.var, result.es)
```

`one_step_var` is the whole model: deseasonalize, fit a Student-t GARCH(1,1) per asset,
map through a Gaussian copula, fit the DCC, then Monte-Carlo the one-step-ahead VaR. The
desk and the test suite both call this and nothing else. Neither reimplements any part of
it, which is what keeps the thing being demonstrated and the thing being validated the
same thing.

The pipeline stages live in `deseasonalize.py`, `garch.py`, `copula.py`, `dcc.py` and
`var.py`. Each is usable on its own if you want a piece rather than the whole.

## FixConfig

The differences between the original model and the corrected one are toggles, not
branches. A baseline run and a fixed run take the same code path and differ only here,
so any before-and-after comparison is attributable to the flag rather than to two
separately written implementations.

| flag | default | effect when true |
|---|---|---|
| `include_expected_returns` | `True` | carries the drift estimate into the VaR. The thesis behaviour |
| `reseasonalize_forecast` | `False` | fits on pure deseasonalized returns, re-seasonalizes the forecast |
| `mask_halts` | `False` | treats a trading halt as missing data rather than a zero return |
| `robust_optimizer` | `False` | reparameterized DCC optimizer |
| `fallback_ccc_on_fail` | `False` | falls back to constant correlation if the DCC fails, and flags the result degraded |
| `guard_pit` | `False` | clamps a saturated PIT so the normal quantile stays finite |

The configuration the live desk ships is in `dccmgarch/live/config.py` as `DESK_MODEL`.

Two of these deserve a note. `reseasonalize_forecast` is off deliberately: it was
measured, and it regressed coverage on four of five windows through a level bias that was
never explained, so it stays available and unused. `guard_pit` is the substantive fix for
stress windows: a saturated Student-t PIT maps to plus or minus infinity through
`norm.ppf`, which poisons every correlation into a NaN VaR. That is a numerical failure
rather than an optimizer failure, and clamping the PIT is what actually resolves it.

## VarResult

Per-asset list fields are aligned to `portfolio.tickers`, and that is the same order as
the rows of `corr_full`.

| field | meaning |
|---|---|
| `var` | value at risk in currency units, one step ahead |
| `es` | expected shortfall behind the same quantile |
| `converged` | whether the DCC optimizer converged |
| `degraded` | whether the constant-correlation fallback was used |
| `dcc_params` | `a`, `b`, `nu` |
| `corr_full` | the forecast correlation matrix, N by N |
| `corr_spotlight` | the 3 by 3 subset the frontend charts |
| `r_cond` | condition number of the forecast correlation matrix |
| `garch_params` | per-asset omega, alpha, beta, nu |
| `sigma_forecast` | per-asset forecast sigma, used for the Euler risk decomposition |
| `compute_seconds` | wall-clock time for this fit |

`r_cond` is the diagnostic that makes the stress-window story measurable rather than
anecdotal. When it goes infinite the correlation matrix is singular and the VaR that
comes out is not meaningful.

## Scenarios

Five evaluation windows, defined by date in `scenarios.py`. Each is 390 bars, five
trading days, with a further 390-bar lead-in ahead of it for the rolling estimate.

The dates are the definition. Row indices are resolved from them at import, so the same
code reads a bar file that has been trimmed to only the windows it needs, which is how
`data/` here holds 3,900 rows rather than the full series.

The windows were frozen before any result was scored. Re-picking a window after seeing
its numbers is the data-snooping failure this study is guarded against, so if you add a
window for your own work, add it rather than editing one of these.

## Golden masters, and why yours may differ slightly

`tests/golden/*.json` pins the model's output under a fixed seed. A fresh clone should
pass `pytest` on any machine, but the numbers may not be bit-identical to the reference,
and that is expected rather than a fault.

The dominant term is the BLAS/LAPACK build underneath NumPy. OpenBLAS and MKL, and
different thread counts within either, produce slightly different floating-point results
from the same inputs. Measured drift across machines was about 0.08 percent on VaR.

So the tolerances are chosen to sit between the two scales that matter:

| quantity | worst observed cross-machine drift | how it is checked |
|---|---|---|
| VaR | 0.51 percent | `rel=1e-2` |
| spotlight correlations | 0.11 percent | `rtol=1e-2, atol=1e-3` |
| DCC `a` | 0.34 percent | coarse guard, `abs=0.03` |
| DCC `b` | up to 85 percent | coarse guard, `abs=0.03` |
| copula `nu` | 15 to 31 percent | checked as the tail index `1/nu` |

The observable outputs carry the regression lock at roughly twice the worst noise and
well below the smallest real regression seen. The DCC scalars are weakly identified: in
low-persistence windows `b` and `nu` sit on flat likelihood ridges and are not
reproducible across machines even though the correlation path they produce is stable.
Pinning them tightly would produce failures that mean nothing, so they are guarded
coarsely and `nu` is asserted through `1/nu`, which is well behaved when the fitted tail
is close to Gaussian.

If a golden fails by a lot, or a non-DCC quantity fails at all, that is a real
regression.

## Backtesting

`backtest/stats.py` implements Kupiec's proportion-of-failures test and Christoffersen's
independence and joint tests. Both are closed form on a hit sequence, so neither needs a
refit or a simulation.

```python
from backtest.stats import compute_stats

hits = [0, 0, 1, 0, 1, ...]        # 1 where the loss exceeded the VaR
stats = compute_stats(hits)        # alpha defaults to 0.05

stats.n_hits, stats.expected_hits  # observed against nominal
stats.lr_uc, stats.lr_uc_reject    # Kupiec, chi-squared(1) at 3.8415
stats.lr_ind                       # Christoffersen independence
stats.lr_cc, stats.lr_cc_reject    # joint, chi-squared(2) at 5.9915
stats.lr_ind_degenerate            # read this before trusting lr_ind
```

Kupiec asks whether the number of exceedances matches the nominal rate. Christoffersen
asks whether they cluster. A model can pass the first and fail the second, and for an
intraday risk tool the second is the more interesting question, because clustering is
what a responsiveness claim actually rests on.

Check `lr_ind_degenerate` before reading `lr_ind`. When the hit sequence has no
consecutive exceedances at all, the independence statistic is zero by construction, and
zero is also what a comfortably passing test looks like. The flag separates the two.

The same caution applies more broadly on a 389-observation window: at a five percent
level you expect about nineteen exceedances, so the transition counts feeding `LR_ind`
are small and the asymptotic chi-squared approximation is under-powered. A passing
independence test on a single window is weak evidence.
