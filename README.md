# DCC-MGARCH terminal

Intraday value-at-risk for an equity portfolio, computed live on your own CPU and shown
on a trading desk that reports how long each computation actually took.

The model is the one from a 2022 master thesis, rebuilt: 5-minute bars, Taylor and Xu
(1997) deseasonalization, GARCH(1,1) Student-t marginals, Engle (2002) DCC under a
Gaussian copula, and a 95% Monte-Carlo VaR one step ahead. The thesis version worked and
had real problems. This is that model as a seeded, tested core, with the problems
addressed and measured.

**Live demo:** https://modelkit.studio/dcc-mgarch

The demo replays a recording. This repository runs the real thing.

## Specification audit — under review

A specification audit of the current implementation identified several material
inconsistencies between the documented model and the code that runs. They are:

1. **Student-t probability-integral transform.** The residual standardization may be
   incorrect, and the unit-variance Student-t parameterization used by the GARCH library
   is not consistently accounted for.
2. **One-step DCC forecast.** The recursion appears to omit the most recently observed
   standardized shock.
3. **Monte-Carlo simulation.** It does not faithfully implement the documented Gaussian
   copula with asset-specific Student-t marginals.
4. **Weighted marginal degrees of freedom.** This quantity is labelled in a way that
   implies it is a Gaussian-copula parameter, which it is not.

These affect the dependence estimates, the VaR forecasts, and the backtest conclusions
that follow from them. The numerical results presented here and on the demo site are
therefore preliminary outputs of the current implementation, not validated results of the
corrected specification.

The affected implementation, tests, documentation, and empirical results are under review.
Corrections and updated results will be documented through public commits, so the audit
history stays legible.

## An invitation

This model is not finished, and I would rather see it improved than admired. Several limits
are known and unsolved: the estimation window is short, the Student-t degrees of freedom sit
implausibly high, and the tests across the five evaluation windows were scored without a
multiple-testing correction. None of that is hidden. It is all written up on the demo site,
including the arithmetic for the correction.

If you can do better, please do. Clone it, break it, open an issue or a pull request. The
golden master and the Kupiec and Christoffersen implementation ship with the code precisely
so that a proposed change can be argued with numbers rather than opinions.

## Quick start

Python 3.10 or newer, Node 18 or newer.

```
start.bat        # Windows
./start.sh       # macOS, Linux
```

That installs both dependency sets, starts the Python model runner and the frontend, and
tells you where to open the browser. Nothing else needs configuring.

Manually, if you prefer:

```
pip install -e .
cd app && npm install && npm run dev     # in one terminal
python -m dccmgarch.serving.live_server  # in another
```

The first risk figure takes ten to thirty seconds depending on your machine. That is one
real GARCH-DCC fit across thirty assets, not a progress animation. Fits run back to back,
so the displayed risk is never staler than a single compute cycle.

## What it does differently from the thesis

**Expected returns are dropped from VaR.** A one-step-ahead five-minute drift estimate is
noise dressed as signal, and carrying it into the VaR distorted the diversification
numbers the tool existed to report.

**Christoffersen is standard, not optional.** Kupiec tests unconditional coverage and is
blind to clustering, but clustering is exactly what a claim about intraday responsiveness
rests on. `LR_ind` runs on the hit sequence Kupiec already produces, so the full
`LR_uc` / `LR_ind` / `LR_cc` triple costs no refit and no new simulation. The
implementation is in `backtest/stats.py` and works on any hit sequence.

**Convergence under market stress.** On a March 2020 window the original optimizer
collapsed: as correlations spike toward one, the forecast correlation matrix approaches
singular and SLSQP fails. Halt-masking plus a reparameterized optimizer took a 30-asset
grind from 35 of 389 steps converging to 389 of 389, with the conditioning diagnostic
`r_cond` falling from infinite to 125. A calm control at the same dimension converges
fully both before and after, which is what shows the failure belonged to the stress
window and not to the number of assets.

## Two clocks, and only one is compressed

The **compute clock** shows genuine wall-clock seconds per fit. It has no speed control,
because the time a fit takes is the thing being reported.

The **market clock** replays five-minute bars at 25x so prices move visibly, and it says
so wherever it appears. The honest claim is only that each risk update takes some real
number of seconds. It is never that a given number of reassessments per market minute is
realistic.

## Layout

| path | what it is |
|---|---|
| `src/dccmgarch/` | the model core. `pipeline.one_step_var(...)` is the single entry point |
| `src/dccmgarch/live/` | the live desk: a seeded order tape over the bars, priced by the core |
| `src/dccmgarch/serving/` | the HTTP transport the browser talks to |
| `app/` | the Next.js frontend |
| `backtest/stats.py` | Kupiec and Christoffersen, on any hit sequence |
| `tests/` | golden master plus the model's proof obligations |
| `data/` | 5-minute price bars. Read `data/README.md` before using them |
| `docs/MODEL.md` | the interfaces you are most likely to touch |

Dependencies run one way. Everything imports the core, and the core imports nothing back.
A baseline run and a fixed run differ by a `FixConfig`, never by a code path, which is
what makes a before-and-after comparison mean anything.

## Tests

```
pytest -q                 # 55 tests, including the golden master
pytest -m slow            # 2 more that each run a real fit
cd app && npx vitest run  # 152 frontend tests
```

The golden masters pin the model's observable outputs under a fixed seed. They are
tolerant enough to absorb cross-machine BLAS and optimizer noise and tight enough to trip
on a real regression, so a small numerical difference on your machine is expected rather
than a broken clone. `docs/MODEL.md` explains the tolerances.

## About the data

`data/` holds real 5-minute bars for thirty large-cap US equities, derived from licensed
intraday market data and anonymized by ticker relabelling. Relabelling means each column
header was replaced by a placeholder code (`XA`, `XB`, ... `ZG`), using three-letter symbols
that are unassigned or reserved on US exchanges so none of them reads as a real company. The
mapping back to securities is not in this repository.

The files are **trimmed to the fifty trading days the five evaluation windows read**, so the
gaps between date ranges are deliberate. Each window carries its own five-day estimation
lead-in, which is why fifty days rather than twenty-five.

The data ships so the model runs on a fresh clone. It is not covered by the MIT license and
is not redistributable as a dataset. See `data/README.md`.

## Running it safely

The model runner is a **development transport**. It binds `127.0.0.1`, answers `GET` only,
holds no credentials and touches no files outside `data/`, and it grants CORS to loopback
origins only — so a page you happen to be browsing cannot reach it. Do not put it behind a
public address: every `/bar` request spends a real multi-second fit, which is a denial of
service handed to whoever can reach the port. There is no authentication because there is
nothing here that a local user does not already have.

`npm audit` in `app/` is not clean, and this is stated rather than hidden. The advisories are
against Next.js server surfaces — the Image Optimizer, Server Actions, middleware, rewrites,
React Server Components — plus `postcss` and the `vitest` toolchain. This build is
`output: "export"`: it compiles to static files, no Next.js process runs, and none of those
surfaces exists at runtime. The dev-server advisories do apply while `npm run dev` is up on
your machine, at the usual cost of running any dev server. Clearing the audit needs a Next.js
major bump, which buys a green number and no security.

## Reproducibility

Everything stochastic is seeded, and every stochastic call threads its seed explicitly.
There are no bare `np.random` calls in the model path. The same seed reproduces the same
order tape, the same fits and the same VaR.

One consequence worth stating plainly: the original thesis code was unseeded, so its
published numbers are not reproducible even by the original code. This project does not
claim to reproduce them exactly. It seeds the generator, pins a golden master under that
seed, and reports before-and-after deltas that exceed Monte-Carlo noise.

## License

MIT for the code. See `LICENSE`, and note that `data/` is explicitly excluded from it.
