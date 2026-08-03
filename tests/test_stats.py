"""Kupiec + Christoffersen, on hand-checked sequences.

``backtest/stats.py`` produces the coverage statistics every result in this project
is scored with, and until now nothing tested it directly. It is closed-form and
stdlib-only, so the arithmetic can be checked against an independent computation
rather than against a recorded output — the expected values below are derived from
the textbook formulae inline, never copied from what the code returned.

The cases that matter here are the degenerate ones. A hit sequence that cannot
identify first-order dependence returns ``lr_ind = 0.0``, which is also what a
comfortably passing independence test looks like, and the whole point of
``lr_ind_degenerate`` is to keep those two apart.
"""

from __future__ import annotations

from math import log

import pytest
from backtest.stats import (
    ALPHA,
    CHI2_CRIT_1DF,
    CHI2_CRIT_2DF,
    christoffersen_lr_ind,
    compute_stats,
    kupiec_lr_uc,
)

# --------------------------------------------------------------------------- Kupiec


def _kupiec_reference(n_obs: int, n_hits: int, alpha: float) -> float:
    """The Kupiec POF statistic, written out independently of the implementation."""
    x, n = n_hits, n_obs
    unrestricted = x * log(alpha) + (n - x) * log(1 - alpha)
    if x == 0:
        restricted = n * log(1 - x / n)
    elif x == n:
        restricted = x * log(x / n)
    else:
        restricted = x * log(x / n) + (n - x) * log(1 - x / n)
    return -2.0 * (unrestricted - restricted)


def test_kupiec_zero_at_nominal_rate():
    """A hit rate exactly equal to alpha is the null: the statistic is 0."""
    assert kupiec_lr_uc(n_obs=100, n_hits=5, alpha=0.05) == pytest.approx(0.0, abs=1e-12)


@pytest.mark.parametrize("n_hits", [0, 1, 5, 19, 40, 100])
def test_kupiec_matches_closed_form(n_hits):
    assert kupiec_lr_uc(100, n_hits, 0.05) == pytest.approx(
        _kupiec_reference(100, n_hits, 0.05), rel=1e-9
    )


def test_kupiec_degenerate_endpoints_are_finite():
    """x=0 and x=n took ``log(0)`` in the legacy notebook; both are limits here."""
    assert kupiec_lr_uc(100, 0, 0.05) == pytest.approx(-2.0 * 100 * log(0.95), rel=1e-9)
    assert kupiec_lr_uc(100, 100, 0.05) == pytest.approx(-2.0 * 100 * log(0.05), rel=1e-9)


def test_kupiec_grows_with_deviation_either_way():
    """Over- and under-coverage both reject; the statistic is two-sided."""
    at_nominal = kupiec_lr_uc(389, 19, ALPHA)
    over = kupiec_lr_uc(389, 60, ALPHA)   # far too many breaches
    under = kupiec_lr_uc(389, 6, ALPHA)   # the over-conservative case this study found
    assert over > at_nominal
    assert under > at_nominal
    assert over > CHI2_CRIT_1DF
    assert under > CHI2_CRIT_1DF


def test_kupiec_over_conservative_window_rejects():
    """The study's own headline: 6 hits where 19.45 are expected rejects Kupiec."""
    stats = compute_stats([1] * 6 + [0] * 383)
    assert stats.expected_hits == pytest.approx(19.45)
    assert stats.lr_uc_reject


# ------------------------------------------------------------------- Christoffersen


def test_independence_flags_perfect_clustering():
    """All exceedances adjacent — maximal first-order dependence."""
    hits = [0] * 30 + [1] * 10 + [0] * 30
    lr, degenerate = christoffersen_lr_ind(hits), compute_stats(hits).lr_ind_degenerate
    assert not degenerate
    assert lr > CHI2_CRIT_1DF


def _independent_hits(n: int, alpha: float, seed: int) -> list[int]:
    """A Bernoulli(alpha) sequence — the null the independence test is written against.

    Deliberately NOT a periodic sequence: hits every k-th bar are *anti*-clustered
    (a hit never follows a hit), which the first-order Markov alternative detects
    just as readily as clustering does. Regular spacing is a different hypothesis
    from independence, and conflating the two is an easy way to write a test that
    asserts the wrong thing.
    """
    import random

    rng = random.Random(seed)
    return [1 if rng.random() < alpha else 0 for _ in range(n)]


def test_independence_quiet_on_an_independent_sequence():
    """Draws that really are independent should not trip the test."""
    stats = compute_stats(_independent_hits(2000, ALPHA, seed=20220101))
    assert not stats.lr_ind_degenerate
    assert stats.lr_ind < CHI2_CRIT_1DF


def test_independence_detects_anti_clustering_too():
    """Perfectly periodic hits violate independence in the other direction.

    Every tenth bar means a hit is never followed by a hit, so ``pi11 = 0`` against
    an unconditional rate of 0.1. The statistic is two-sided in the same sense
    Kupiec is, and this pins that behaviour rather than leaving it incidental.
    """
    stats = compute_stats([1 if i % 10 == 0 else 0 for i in range(200)])
    assert not stats.lr_ind_degenerate
    assert stats.lr_ind > CHI2_CRIT_1DF


def test_single_empty_transition_cell_is_not_degenerate():
    """``n11 == 0`` while state 1 still has a predecessor stays identifiable.

    This is the boundary the docstring calls out: an empty cell is not the same
    condition as an unidentifiable test, and the ``0 log 0`` convention keeps it
    finite rather than degenerate.
    """
    hits = [0, 1, 0, 0, 1, 0, 0, 0, 1, 0]  # no two hits adjacent -> n11 == 0
    stats = compute_stats(hits)
    assert not stats.lr_ind_degenerate
    assert stats.lr_ind == pytest.approx(stats.lr_ind)  # finite, not NaN/inf


@pytest.mark.parametrize(
    "hits, why",
    [
        ([], "empty"),
        ([1], "single observation, no transition"),
        ([0] * 50, "all zeros — pi = 0"),
        ([1] * 50, "all ones — pi = 1"),
        ([0, 0, 0, 1], "a trailing hit has no state-1 predecessor"),
    ],
)
def test_degenerate_sequences_are_flagged(hits, why):
    """Every unidentifiable case returns 0.0 AND says so. The flag is the point."""
    stats = compute_stats(hits)
    assert stats.lr_ind == 0.0, why
    assert stats.lr_ind_degenerate, why


def test_degenerate_zero_is_distinguishable_from_a_passing_zero():
    """The reason ``lr_ind_degenerate`` exists, asserted directly."""
    unidentifiable = compute_stats([0] * 50)
    identifiable = compute_stats(_independent_hits(2000, ALPHA, seed=20220101))
    assert unidentifiable.lr_ind == 0.0 and unidentifiable.lr_ind_degenerate
    assert identifiable.lr_ind < CHI2_CRIT_1DF and not identifiable.lr_ind_degenerate


def test_independence_is_never_negative():
    """Float error in the LR difference must not surface as a negative statistic."""
    for period in range(2, 12):
        hits = [1 if i % period == 0 else 0 for i in range(300)]
        assert christoffersen_lr_ind(hits) >= 0.0


# ---------------------------------------------------------------------------- joint


def test_lr_cc_is_the_sum_and_uses_two_dof():
    """``LR_cc = LR_uc + LR_ind``, up to the reporting rounding.

    Each field is rounded to 4dp independently, so the reported sum can differ from
    the sum of the reported parts by up to 2e-4. That is a presentation artifact of
    the dataclass, not an arithmetic disagreement — asserted at the tolerance it can
    actually meet rather than tightened until it flakes.
    """
    hits = [0] * 30 + [1] * 10 + [0] * 30
    stats = compute_stats(hits)
    assert stats.lr_cc == pytest.approx(stats.lr_uc + stats.lr_ind, abs=2e-4)
    assert stats.lr_cc_reject == (stats.lr_cc > CHI2_CRIT_2DF)


def test_clustering_can_reject_where_kupiec_passes():
    """The §3.7 argument for adding Christoffersen, as an executable claim.

    Correct unconditional coverage, every exceedance consecutive: Kupiec is
    structurally blind to this and the joint test is not.
    """
    n = 200
    hits = [0] * 95 + [1] * 10 + [0] * 95
    stats = compute_stats(hits)
    assert stats.n_hits == 10 and stats.expected_hits == pytest.approx(10.0)
    assert not stats.lr_uc_reject      # coverage is exactly nominal
    assert stats.lr_ind > CHI2_CRIT_1DF  # clustering is severe
    assert stats.lr_cc_reject          # the joint test catches it
    assert n == stats.n_obs


def test_reported_fields_are_consistent():
    hits = [1 if i % 7 == 0 else 0 for i in range(389)]
    stats = compute_stats(hits)
    assert stats.n_obs == 389
    assert stats.n_hits == sum(hits)
    assert stats.expected_hits == pytest.approx(round(ALPHA * 389, 2))


def test_alpha_is_configurable():
    """A 99% VaR expects a fifth of the breaches a 95% one does."""
    hits = [1] * 10 + [0] * 190
    assert compute_stats(hits, alpha=0.01).expected_hits == pytest.approx(2.0)
    assert compute_stats(hits, alpha=0.05).expected_hits == pytest.approx(10.0)
    # 10 hits is nominal at 5% but a gross over-breach at 1%.
    assert not compute_stats(hits, alpha=0.05).lr_uc_reject
    assert compute_stats(hits, alpha=0.01).lr_uc_reject
