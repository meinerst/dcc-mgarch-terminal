"""VaR backtest statistics: Kupiec POF + Christoffersen.

Two tests, both closed-form on the exceedance (hit) sequence the rolling backtest
already produces — no model re-fit, no Monte-Carlo (Planning.md 3.7: "the 20-hour
cost was the backtest, not the statistic").

- ``LR_uc`` — Kupiec (1995) proportion-of-failures. Unconditional coverage only;
  the original thesis reported just this. Reproduces the legacy formula
  (``old-code-artifacts/App/.../Kupiec (2. Analysis).ipynb``), with the x=0 / x=n
  degenerate cases handled (the legacy ``log(0)`` blew up there).
- ``LR_ind`` — Christoffersen (1998) first-order-Markov independence. NEW; tests
  exceedance clustering, which Kupiec is structurally blind to (Planning.md 3.7,
  the project's central intraday-responsiveness claim).
- ``LR_cc = LR_uc + LR_ind`` ~ chi2(2). Joint conditional coverage.

Power caveat (Planning.md 3.5/3.7): on ~389 obs there are only ~19 hits, so the
transition counts feeding ``LR_ind`` are tiny and the asymptotic chi2 is
under-powered. Flagged, not hidden.
"""

from __future__ import annotations

from dataclasses import dataclass
from math import log

ALPHA = 0.05
CHI2_CRIT_1DF = 3.8415  # chi2(1) 95% — Kupiec / independence single test
CHI2_CRIT_2DF = 5.9915  # chi2(2) 95% — joint conditional coverage


@dataclass(frozen=True)
class BacktestStats:
    n_obs: int
    n_hits: int
    expected_hits: float
    lr_uc: float
    lr_uc_reject: bool
    lr_ind: float
    lr_cc: float
    lr_cc_reject: bool
    # Additive (research/README.md schema unchanged): explicit degeneracy flag so a
    # silent lr_ind == 0.0 is never misread as a passed independence test.
    lr_ind_degenerate: bool = False


def _xlogx_ratio(count: int, total: int) -> float:
    """``count * log(count / total)`` with the ``0 * log 0 = 0`` convention."""
    if count == 0:
        return 0.0
    return count * log(count / total)


def kupiec_lr_uc(n_obs: int, n_hits: int, alpha: float = ALPHA) -> float:
    """Kupiec proportion-of-failures LR statistic (unconditional coverage).

    ``LR_uc = -2 [ x ln a + (n-x) ln(1-a) - x ln(x/n) - (n-x) ln(1-x/n) ]``,
    with the degenerate x=0 and x=n cases taken as limits (the second bracket
    vanishes there under ``0 ln 0 = 0``).
    """
    x, n = n_hits, n_obs
    unrestricted = x * log(alpha) + (n - x) * log(1 - alpha)
    restricted = _xlogx_ratio(x, n) + _xlogx_ratio(n - x, n)
    return -2.0 * (unrestricted - restricted)


def _christoffersen_ind(hits: list[int]) -> tuple[float, bool]:
    """Independence LR statistic **and** an explicit degeneracy flag.

    Returns ``(lr, degenerate)``. ``degenerate is True`` when the transition data
    cannot identify first-order dependence — fewer than two observations, no
    state-1 predecessor (``n10 + n11 == 0``), or a boundary hit rate
    (``pi in {0, 1}``, i.e. all-0 or all-1). In every degenerate case ``lr`` is the
    limiting value ``0.0``, which means *independence is unidentifiable here*, NOT
    that independence holds — callers must not read a degenerate ``0.0`` as a pass.

    A single empty transition cell (e.g. ``n11 == 0`` while state 1 still has a
    predecessor) is NOT degenerate: the test stays identifiable and the ``_term``
    ``0 * log 0 = 0`` convention keeps it finite.
    """
    n00 = n01 = n10 = n11 = 0
    for prev, cur in zip(hits[:-1], hits[1:], strict=True):
        if prev == 0 and cur == 0:
            n00 += 1
        elif prev == 0 and cur == 1:
            n01 += 1
        elif prev == 1 and cur == 0:
            n10 += 1
        else:
            n11 += 1

    total = n00 + n01 + n10 + n11
    if total == 0:  # < 2 observations -> no transition to test
        return 0.0, True

    pi = (n01 + n11) / total
    # No transitions out of state 1, or a degenerate all-0 / all-1 rate ->
    # independence unidentifiable -> limiting value 0.0, flagged degenerate.
    if (n10 + n11) == 0 or pi in (0.0, 1.0):
        return 0.0, True

    pi01 = n01 / (n00 + n01) if (n00 + n01) > 0 else 0.0
    pi11 = n11 / (n10 + n11)

    # log L under independence (single pi) minus log L under the Markov alt.
    ll_null = _term(n01 + n11, pi) + _term(n00 + n10, 1 - pi)
    ll_alt = (
        _term(n01, pi01) + _term(n00, 1 - pi01)
        + _term(n11, pi11) + _term(n10, 1 - pi11)
    )
    lr = -2.0 * (ll_null - ll_alt)
    return max(lr, 0.0), False  # guard tiny negative from float error


def christoffersen_lr_ind(hits: list[int]) -> float:
    """First-order-Markov independence LR statistic (exceedance clustering).

    Float-only view of :func:`_christoffersen_ind` (signature preserved for
    existing callers). A ``0.0`` return can mean *either* no clustering *or* a
    degenerate/unidentifiable sequence — use ``compute_stats``'
    ``lr_ind_degenerate`` to tell the two apart.
    """
    lr, _ = _christoffersen_ind(hits)
    return lr


def _term(count: int, prob: float) -> float:
    """``count * log(prob)`` with the ``0 * log 0 = 0`` convention."""
    if count == 0:
        return 0.0
    return count * log(prob)


def compute_stats(hits: list[int], alpha: float = ALPHA) -> BacktestStats:
    """Full triple LR_uc + LR_ind -> LR_cc for a hit sequence."""
    n_obs = len(hits)
    n_hits = sum(hits)
    lr_uc = kupiec_lr_uc(n_obs, n_hits, alpha) if n_obs > 0 else 0.0
    lr_ind, lr_ind_degenerate = _christoffersen_ind(hits)
    lr_cc = lr_uc + lr_ind
    return BacktestStats(
        n_obs=n_obs,
        n_hits=n_hits,
        expected_hits=round(alpha * n_obs, 2),
        lr_uc=round(lr_uc, 4),
        lr_uc_reject=lr_uc > CHI2_CRIT_1DF,
        lr_ind=round(lr_ind, 4),
        lr_cc=round(lr_cc, 4),
        lr_cc_reject=lr_cc > CHI2_CRIT_2DF,
        lr_ind_degenerate=lr_ind_degenerate,
    )
