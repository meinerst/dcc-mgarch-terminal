"""``one_step_var`` — THE single honest entry point.

Both the desk and the backtest call exactly this; neither reimplements the model,
which is what makes a before/after delta a property of the fix rather than of two
separately written pipelines. Baseline (``FixConfig`` all-off) reproduces the original
notebook behavior; each fix flag flips one branch on. All five marquee fixes
(§3.1 seasonality, §3.4 expected returns, §3.3 halt-masking / robust optimizer /
CCC fallback) are wired here behind their ``FixConfig`` toggles.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from time import perf_counter

import numpy as np
import pandas as pd

from . import BARS_PER_DAY, DEFAULT_SEED
from .copula import PIT_GUARD_EPS, RESID_WINSOR, gaussian_copula_transform
from .dcc import ccc_fit, fit_dcc
from .deseasonalize import deseasonalize
from .garch import fit_garch_t
from .halts import detect_halts
from .portfolio import Portfolio
from .var import forecast_sigma, mc_var

# Returns are scaled by this factor before GARCH/DCC fitting (optimizer
# conditioning), then covariance is scaled back by its square. From the notebook.
RETURN_SCALE = 1000.0

# §3.1 (ERR-01) counterpart. The ×1000 above was tuned for native-magnitude returns;
# the reseasonalize path fits *pure* deseasonalized rd, which is already standardized
# (std ~ 1), so reusing 1000.0 sends it to std ~ 1000 and arch's GARCH conditioning
# breaks (nan / non-converged — the old EXP-02 blocker). The scale is provably
# fit-neutral (an affine scale is absorbed by omega; test_rescale_is_scale_only), so
# this constant governs conditioning ONLY and never the answer. The native path keeps
# RETURN_SCALE untouched, which is what keeps the golden master pinned.
RD_RETURN_SCALE = 1.0

# Baseline margin requirement. The golden-master portfolio is long-only, so this
# has no effect on the pinned numbers; shorts/margin are revisited with the demo.
DEFAULT_MARGIN_REQUIREMENT = 0.0

# Number of assets shown in the correlation spotlight (3D tops out at 3 axes).
SPOTLIGHT_N = 3


@dataclass
class FixConfig:
    """Toggles the marquee fixes so baseline and fixed runs share one code path."""

    include_expected_returns: bool = True  # 3.4: False = drop expected returns from VaR
    reseasonalize_forecast: bool = False  # 3.1: True = fit on pure rd, re-seasonalize forecast
    mask_halts: bool = False  # 3.3 Tier-2: halt-masking on
    robust_optimizer: bool = False  # 3.3 Tier-2: reparameterized optimizer
    fallback_ccc_on_fail: bool = False  # 3.3 Tier-1: CCC-GARCH + DEGRADED banner
    guard_pit: bool = False  # 3.3 numerical: clamp saturated PIT so norm.ppf stays finite


@dataclass
class VarResult:
    """Everything the demo and the backtest both need from one reassessment.

    Per-asset list fields are aligned to ``portfolio.tickers``: ``sigma_forecast[i]``
    and ``garch_params[i]`` describe ticker ``i``, the same order as ``corr_full``'s rows.
    """

    var: float
    converged: bool
    degraded: bool
    dcc_params: dict
    corr_spotlight: list
    es: float  # Expected Shortfall at the same alpha as `var`
    corr_full: list = field(default_factory=list)  # full NxN R_t_forecast
    r_cond: float = float("inf")  # cond(NxN R_t_forecast) -> the crash exhibit
    hit: bool | None = None  # set by the backtest layer, not here
    compute_seconds: float = 0.0
    garch_params: list = field(default_factory=list)  # per-asset omega/alpha/beta/nu
    sigma_forecast: list = field(default_factory=list)  # per-asset forecast sigma


def one_step_var(
    window: pd.DataFrame,
    portfolio: Portfolio,
    *,
    seed: int = DEFAULT_SEED,
    fixes: FixConfig | None = None,
) -> VarResult:
    """Compute one-step-ahead intraday VaR for ``portfolio`` over price ``window``.

    Parameters
    ----------
    window
        Trailing price history (~5 trading days) with assets on columns. Only the
        portfolio's tickers are used.
    portfolio
        The :class:`Portfolio` (positions + prices).
    seed
        Threaded into the only stochastic step (the MC-VaR draw).
    fixes
        Marquee-fix toggles; defaults to all-off (baseline).
    """
    fixes = fixes or FixConfig()

    start = perf_counter()

    tickers = portfolio.tickers
    prices = window[tickers]
    returns = prices.pct_change().iloc[1:]

    # Deseasonalize (Taylor & Xu), then scale up for optimizer conditioning.
    # §3.1 fix: fit on pure per-slot rd (rescale=False) and re-seasonalize the
    # forecast by the target slot; baseline keeps the global rescale-back (ERR-01).
    deseasonalized, factors = deseasonalize(
        returns, rescale=not fixes.reseasonalize_forecast
    )

    # §3.3 fix (ERR-03): a circuit-breaker halt is missing data, not a zero return.
    # Deseasonalize keeps the full contiguous series (slots stay positionally
    # correct); the halted bars are dropped only from the estimation panel. One
    # shared mask (any ticker halted) keeps the copula rows aligned across assets.
    if fixes.mask_halts:
        halt_mask = detect_halts(prices).reindex(returns.index).fillna(False)
        deseasonalized = deseasonalized[~halt_mask[tickers].any(axis=1)]

    # Scale is path-dependent: pure rd is already standardized (see RD_RETURN_SCALE).
    # Whatever is applied here must be handed to mc_var below to be undone.
    return_scale = RD_RETURN_SCALE if fixes.reseasonalize_forecast else RETURN_SCALE
    scaled = deseasonalized * return_scale

    # Univariate GARCH(1,1)-t per asset -> uniform PIT residuals.
    garch_fits = [fit_garch_t(scaled[ticker].dropna()) for ticker in tickers]
    udata = pd.DataFrame(
        {ticker: fit.udata for ticker, fit in zip(tickers, garch_fits, strict=True)}
    )

    # Gaussian copula -> DCC on the normal-space residuals (§3.3 robust optimizer
    # when enabled). Tier-1 fallback: if the DCC fit fails to converge, freeze
    # correlation (CCC) and mark the result degraded rather than crash the app.
    # §3.3 numerical guard (opt-in): clamp saturated crash-window PIT so norm.ppf can
    # never emit +/-inf and poison every downstream correlation (-> NaN VaR). No-op on
    # baseline (guard_pit=False) and wherever the PIT is already interior.
    _pit_kw = (
        {"clip_eps": PIT_GUARD_EPS, "winsor": RESID_WINSOR} if fixes.guard_pit else {}
    )
    std_resid = pd.DataFrame(
        gaussian_copula_transform(udata, **_pit_kw), columns=tickers
    )
    dcc_fit = fit_dcc(std_resid, robust=fixes.robust_optimizer)
    degraded = False
    if fixes.fallback_ccc_on_fail and not dcc_fit.converged:
        dcc_fit = ccc_fit(std_resid)
        degraded = True

    if fixes.reseasonalize_forecast:
        # §3.1: forecast variance is in pure-rd units; scale it back to native units
        # for the specific upcoming intraday slot (not the whole-day average).
        slot = _forecast_slot(len(returns))
        for ticker, fit in zip(tickers, garch_fits, strict=True):
            fit.forecast_variance = _reseasonalize_slot(
                fit.forecast_variance, factors.loc[slot, ticker]
            )
        # Expected return in native units comes straight from the raw returns; the
        # pure-rd series is standardized, so its mean is not the native drift.
        mean_returns = returns[tickers].mean().to_numpy()
    else:
        # Expected returns for the MC draw come from the native-unit deseasonalized
        # returns (== scaled / RETURN_SCALE, and == returns.mean()), matching the notebook.
        mean_returns = deseasonalized[tickers].mean().to_numpy()

    mc = mc_var(
        portfolio,
        dcc_fit,
        garch_fits,
        seed=seed,
        mean_returns=mean_returns,
        include_expected_returns=fixes.include_expected_returns,
        margin_requirement=DEFAULT_MARGIN_REQUIREMENT,
        return_scale=return_scale,
    )

    compute_seconds = perf_counter() - start

    # §2.1a honest conditioning diagnostic: condition number of the NxN forecast
    # correlation. |R_t| -> 0 (correlations spike to 1) is the crash pathology, so
    # this blows up on the same bars converged should flip. A singular R_t gives
    # +inf; a *non-finite* R_t (the degenerate crash limit) is worse still and must
    # report +inf rather than let cond raise and take the whole VaR run down with it.
    r_forecast = dcc_fit.R_t_forecast
    if not np.all(np.isfinite(r_forecast)):
        r_cond = float("inf")
    else:
        try:
            r_cond = float(np.linalg.cond(r_forecast))
        except np.linalg.LinAlgError:
            r_cond = float("inf")

    return VarResult(
        var=mc.var,
        es=mc.es,
        converged=dcc_fit.converged,
        degraded=degraded,
        dcc_params=_dcc_params(dcc_fit, garch_fits, portfolio),
        corr_spotlight=_corr_spotlight(dcc_fit),
        corr_full=_corr_full(dcc_fit),
        r_cond=r_cond,
        compute_seconds=compute_seconds,
        garch_params=[
            {"ticker": t, "omega": g.omega, "alpha": g.alpha, "beta": g.beta, "nu": g.nu}
            for t, g in zip(tickers, garch_fits, strict=True)
        ],
        # Read AFTER mc_var, deliberately: the reseasonalize_forecast branch above mutates
        # `forecast_variance` in place and `return_scale` is path-dependent, so reading here
        # is what guarantees these sigmas are sqrt(diag(H_t)) for the covariance the VaR was
        # actually drawn from, on both paths.
        sigma_forecast=[float(s) for s in forecast_sigma(garch_fits, return_scale)],
    )


def _forecast_slot(n_returns: int, bars_per_day: int = BARS_PER_DAY) -> int:
    """Intraday slot the one-step-ahead forecast falls in.

    Return row ``k`` sits in slot ``k % bars_per_day`` (deseasonalize aligns slots
    positionally). The forecast is the bar after the last return, i.e. row
    ``n_returns`` -> slot ``n_returns % bars_per_day``.
    """
    return n_returns % bars_per_day


def _reseasonalize_slot(forecast_variance: float, seasonal_factor: float) -> float:
    """Scale a pure-rd forecast variance back to native units for its target slot.

    ``rd = returns / S`` per slot, so ``Var(returns_slot) = Var(rd) * S**2``. Pure
    variance in, native-slot variance out (§3.1).

    Units: this path fits on pure rd scaled by ``RD_RETURN_SCALE`` (1.0), so the value
    returned here is already native and ``mc_var``'s ``return_scale**2`` division is a
    no-op. The baseline path is the one that carries the ×1000 and has it undone there.
    """
    return forecast_variance * seasonal_factor**2


def _dcc_params(dcc_fit, garch_fits, portfolio: Portfolio) -> dict:
    """The two fitted DCC scalars, plus a display summary of the MARGINAL tails.

    ``nu_marginal_avg`` is the absolute-exposure-weighted mean of the per-asset GARCH-t
    degrees of freedom — a readable one-number summary of how fat the book's tails are.
    It is NOT a copula parameter: the copula here is Gaussian and has none, and nothing
    in the model consumes this value (``mc_var`` draws each asset on its own ``nu``).
    Named for what it is; the per-asset numbers live in ``VarResult.garch_params``.
    """
    asset_weights = portfolio.weights.to_numpy()
    nus = np.array([g.nu for g in garch_fits])
    nu_marginal_avg = float(np.round(np.sum(asset_weights * nus), 3))
    return {"a": dcc_fit.a, "b": dcc_fit.b, "nu_marginal_avg": nu_marginal_avg}


def _corr_spotlight(dcc_fit) -> list:
    """Up-to-3x3 forecast correlation of the first spotlight assets."""
    k = min(SPOTLIGHT_N, dcc_fit.R_t_forecast.shape[0])
    return dcc_fit.R_t_forecast[:k, :k].round(6).tolist()


def _corr_full(dcc_fit) -> list:
    """The full NxN forecast correlation, rounded to 4 dp.

    Additive to ``corr_spotlight``, which stays 3x3 and unchanged. Like ``r_cond``
    this must never raise: a non-finite ``R_t_forecast`` is the degenerate
    crash limit, and the values pass through as-is so the *caller* rejects the bar
    (``live.fits.is_servable``) rather than the diagnostic taking the run down.
    """
    return np.round(dcc_fit.R_t_forecast, 4).tolist()
