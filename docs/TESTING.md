# Testing — what is pinned, what is guarded, and how the tolerances were chosen

The suite is small and the interesting part is not its size. It is that a numerical
model cannot be regression-tested by pinning its outputs and asserting equality, and
the choices this suite makes about *what to assert* are the part worth reading.

The source is the authority where this and the code disagree. Tolerance rationale also
lives in the `test_golden_master.py` module docstring, next to the assertions it explains.

## The suites

| file | lines | what it establishes |
|---|---|---|
| `tests/test_golden_master.py` | 80 | the seeded core does not drift, on four frozen scenarios |
| `tests/test_fixes.py` | 178 | each `FixConfig` flag does what it claims **and only that** |
| `tests/test_crash.py` | 105 | behaviour under a stress window that once collapsed |
| `tests/test_live_session.py` | 461 | session plan, order tape, payload shape |
| `tests/test_stats.py` | 219 | Kupiec and Christoffersen against the closed forms |
| `tests/_golden_helpers.py` | 30 | the single definition of a seeded run |

`_golden_helpers.py` is deliberately the only place a seeded run is defined. Both the
generator that writes the references and the test that checks against them import it, so
the two cannot drift apart. A golden master whose generator and checker disagree pins
nothing.

The portfolio in that helper is the backtest's own builder rather than a copy of it. The
golden VaR and the first step of a backtest roll are supposed to be the same number, and
that only holds if they are the same book.

## The problem the golden masters actually have

The references were baked bit-tight, at `rel=1e-6`, on one machine. That tolerance is
tighter than cross-machine numerical noise, so at `1e-6` reproducing them is a property
of the exact stack that produced them rather than of the version ranges in
`pyproject.toml`. A fresh clone on a different machine failed, and it failed for reasons
that had nothing to do with the model being wrong.

The dominant term is the BLAS/LAPACK build underneath NumPy. OpenBLAS and MKL, and
different thread counts within either, produce different floating-point results from
byte-identical inputs and byte-identical code. Under it sits the MLE optimizer, which
terminates at a slightly different point when the likelihood surface is flat.

Measured on 2026-07-23, in a cloud container against the reference machine:

| stack (numpy / pandas / arch) | golden `calm` VaR | GARCH scale-invariance α |
|---|---|---|
| fresh install: 2.4 / 3.0 / 8.0 | 128.21 — 0.08 % off | 0.1012 against 0.0805 |
| capped majors: 1.26 / 2.3 / 7.2 | 128.21 | 0.1019 against 0.0805 |
| plus arch 6.x: 1.26 / 2.3 / 6.3 | 128.21 | 0.1019 against 0.0805 |

Reference `calm` VaR is 128.31.

Two things come out of that table. Capping the majors does **not** restore `1e-6` — the
VaR drift stays at 0.08 % because the BLAS build, not the package version, is producing
it. And the α column is a different kind of failure entirely: 0.0805 against 0.1012 is a
26 % break in a GARCH parameter, which is a real regression rather than noise. That break
is what set the upper end of the usable tolerance window, and the fix was a version cap
rather than a looser assertion — `scipy<1.16`, because scipy 1.16.2 breaks the GARCH
scale-invariance property that `test_fixes.py::test_rescale_is_scale_only` asserts. The
caps in `pyproject.toml` each carry the measurement that produced them.

## What the tolerances are, and why they are not uniform

The naive repair is to loosen every assertion until the suite passes. That was rejected:
a tolerance loose enough to absorb the worst-drifting quantity would be far too loose for
the quantities that barely drift at all, and the suite would go green on real
regressions.

So the audit was run across all four scenarios per quantity rather than on one, and the
drift split sharply:

| quantity | worst cross-machine drift | treatment |
|---|---|---|
| VaR (observable) | 0.51 % — `5.1e-3`, volatile3 | **pinned**, `rel=1e-2` |
| spotlight correlations (observable) | 0.11 % — `1.1e-3`, volatile3 | **pinned**, `rtol=1e-2, atol=1e-3` |
| DCC `a` | 0.34 % | coarse guard, `abs=0.03` |
| DCC `b` (persistence) | **up to 85 %**, volatile3 | coarse guard, `abs=0.03` |
| average marginal `nu` | **15 to 31 %** | tail index `1/nu`, `abs=2e-2` |

**The observable outputs carry the regression lock.** VaR and the spotlight correlations
are well-conditioned, they are what the desk displays, and they are what a real
regression moves. `rel=1e-2` sits about twice above the worst observed noise and about
twenty-five times below the smallest real regression signal measured — the 26 % GARCH
break above. That gap between the noise floor and the signal floor is the entire reason a
tolerance can be chosen non-arbitrarily.

**The DCC scalars are not pinned, because they are not determined.** In low-persistence
windows — volatile3 fits `a + b ≈ 0.03` — the persistence `b` and the marginal degrees of
freedom sit on flat likelihood ridges. The likelihood barely changes along the ridge, so
two optimizers on two BLAS builds stop at genuinely different parameter values while
producing a correlation path that agrees to a tenth of a percent. Pinning `b` at `1e-2`
would fail constantly and every failure would be meaningless. It is guarded coarsely
instead: `abs=0.03` catches gross breakage and ignores ridge wander.

**`nu` is asserted through its reciprocal.** The fitted marginal tail is close to
Gaussian, and `nu` is near-unidentified in that regime — the difference between `nu=268`
and `nu=339` is almost nothing in distribution, but it is a 26 % relative change in the
parameter. The tail index `1/nu` is the well-behaved reparameterization: those two values
are `0.0037` and `0.0029`, a difference the `abs=2e-2` guard correctly treats as small.
The same reformulation fixes the analogous flat-ridge failure in
`test_fixes.py::test_rescale_is_scale_only`.

The rule underneath all of it: **test what the model determines, guard what it does not.**
A parameter the data does not identify is not a regression target, and asserting on one
produces a suite that fails for reasons unrelated to correctness — which is how a suite
stops being run.

## Reading a failure

- A **non-DCC quantity failing at all** is a real regression. VaR and the correlations do
  not drift past `1e-2` from numerical noise.
- A **DCC scalar failing** the coarse guard means something structural moved. The guard is
  wide enough that ridge wander cannot trip it.
- A **golden failing by a lot** — orders of magnitude, sign flips, NaN — is not a
  tolerance question. Check `converged` and `r_cond` first.
- **Small numerical differences from the published reference are expected**, not a broken
  clone. That is what the tolerance is absorbing.

## Coverage

Measured on the surface this repository ships — the model core plus the two backtest
modules — and reported by CI on every push rather than gated:

```
TOTAL    875 statements    158 missed    82%
```

There is **no threshold**, deliberately. A coverage floor that fails the build creates
pressure to write tests that move the number, and a suite whose design principle is *test
what the model determines, guard what it does not* is the opposite of that. The number is
published so it can be read, not defended.

Where the misses are: `serving/live_server.py` at 49 percent is the HTTP transport, whose
error paths are exercised by running it rather than by unit tests; `live/session.py` at 66
percent and `live/cpu.py` at 64 percent are the desk's orchestration and machine
introspection. The model path itself — `garch`, `dcc`, `copula`, `deseasonalize`, `var`,
`pipeline` — sits between 90 and 100 percent.

## One test is expected to fail, and the reason is worth reading

`test_rescale_leaves_alpha_beta_invariant` is marked `xfail`. Scaling a return series by
a constant should leave the GARCH `alpha` and `beta` unchanged and multiply `omega` by the
square of the scale — a property of the likelihood, and one this project's forecast-scale
argument rests on.

The property is true. Its *recovery by the optimizer* is not reliable. On the series this
test uses, persistence is high (`a + b ≈ 0.975`) and the likelihood surface is
correspondingly flat, and `arch`'s SLSQP reports successful convergence at genuinely
different points depending on the BLAS build underneath it. Measured on the same commit:

| machine | `alpha` base | `alpha` scaled | relative gap |
|---|---|---|---|
| Windows, Python 3.12 | 0.0808 | 0.0799 | 0.011 |
| CI, Python 3.10 | — | — | passes |
| CI, Python 3.12 | 0.0805 | 0.1019 | **0.267** |

0.267 is thirteen times the assertion's tolerance. That rules out the easy repairs: it is
not floating-point noise, and it cannot be seeded away because `fit_garch_t` draws no
random numbers at all — it is deterministic optimization landing in a different basin.

Widening the tolerance to 0.27 would make the test pass and destroy it, because a 26
percent move in `alpha` is precisely the real-regression signal the tolerance design
above is calibrated against. So the assertion is kept at the width where it means
something and allowed to fail instead, with `strict=False` so a pass is not an error
either.

What is *not* affected: the affine identity and the `omega` scaling law are asserted
unconditionally in `test_rescale_is_scale_only`, and every golden master passes on every
platform tested. The gap is in parameter recovery on a near-flat surface, which is the
same weak-identification phenomenon the DCC scalars show — here it reaches a parameter
that is normally well determined.

A real fix belongs in the fit: tighter convergence criteria, better starting values, or
demonstrating the invariant on a series whose likelihood is not near-flat. That is a
change to the estimation path every published result depends on, so it is recorded rather
than rushed.

## What this suite does not do

Stated plainly, because a test suite's gaps are part of what it tells you:

- **The frozen evaluation windows carry no multiple-testing correction.** Five windows
  scored against the same nominal level, uncorrected. The demo site's Results section works
  the arithmetic through; the short version is that most of the study's own rejections do
  not survive Bonferroni.
- **The golden masters pin a seeded path, not a distribution.** They establish that the
  code has not changed. They establish nothing about whether the model is right — that is
  what the Kupiec and Christoffersen backtests are for, and their verdict on this model is
  unfavourable.
- **The transport layer is thinly covered**, as the coverage section says. It binds
  loopback, answers `GET` only and holds no credentials, so the risk it carries is low, but
  that is an argument about consequences rather than evidence that it works.
- **Nothing here tests the frontend against the model.** The Vitest suite covers the
  frontend's own logic and the Python suite covers the core; no test drives the browser
  against a live fit.
