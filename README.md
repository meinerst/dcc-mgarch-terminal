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

A specification audit in July 2026 found four material inconsistencies between the model
this project documents and the model its code computed: the standardization of the
Student-t probability integral transform, the one-step DCC forecast, the Monte-Carlo draw,
and the label on a degrees-of-freedom summary. All four are corrected, every result was
regenerated afterwards, and the correction cost the project its headline finding. What was
wrong, and what it changed, is written up under Results on the demo site; the corrected
transforms are specified in `docs/MODEL.md`. The commit history above is the audit trail.

## Scope: a daily model on intraday data

DCC is specified and validated on daily returns. Engle (2002) estimates conditional
correlation from one observation per day, over a long history, with slow mean-reverting
dynamics. This project applies that model to 5-minute bars, which is a different process
with a shape daily data does not have. The Taylor and Xu deseasonalization is a patch on
that mismatch rather than a native part of the model: it exists because intraday volatility
is U-shaped across the session and the model has no term for it.

The patch does not carry the model. The forecast is flat across the trading day while the
realised tail is not, and the exceedances follow: across the five evaluation windows, 28 of
65 fall in the opening half hour, which expects 7.5. The obvious repair was built and
measured. Re-seasonalizing the forecast per slot confirmed the mechanism decisively, moving
one window's clustering statistic from 8.37 to 0.0002, and regressed coverage on every
window at the same time, to 32, 38, 52 and 51 exceedances against 19.45 expected. The cause
of that level bias is unresolved and the variant is not shipped. The mismatch is therefore
not a defect that can be corrected out of this specification.

The scope conclusion is that this model on this data does not produce usable value-at-risk.
It is over-conservative in aggregate, breaching roughly six to nine times per window where
19.45 are expected, and wrong in the opposite direction exactly where intraday risk
concentrates. The fitted marginals compound it: the Student-t degrees of freedom sit
implausibly high, at a median of 268 to 339 across the evaluation windows against a fitter
bound of 500, which means the marginals carry no meaningful excess kurtosis and a Student-t
at those values is a normal distribution wearing a fat-tailed label. The specification names
a fat-tailed innovation and the estimation does not find one. None of that is hidden. It is
written up on the demo site, including the arithmetic for the multiple-testing correction,
under which most of the study's own rejections do not survive. There are also known reasons
a daily correlation model resists high-frequency data, notably microstructure noise in
observed prices and the Epps effect on correlations measured over a fixed grid, and neither
is measured here.

The field addresses this by changing what is modelled. With intraday data, the covariance
can be measured from the ticks rather than inferred from squared returns, using realised
covariance and its noise-robust and asynchronicity-robust forms, such as realised kernels
and the Hayashi-Yoshida estimator, and the resulting series is then modelled directly, by
HAR or by realised-data variants of DCC, such as DCC-HEAVY. That is a different model class,
not a tuning of this one, which is why this repository is not a starting point for a better
intraday risk model. It is the record of establishing that it could not become one.

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

**A headline finding, reported dead.** On a March 2020 window the original collapsed: a
30-asset grind estimated on 35 of 389 steps, with the conditioning diagnostic `r_cond`
infinite. That failure is real and reproducible, and this project was built around
repairing it with halt-masking and a reparameterized optimizer. The repair was not what
fixed it. The specification audit found the collapse was driven by the standardization of
the Student-t probability integral transform, which saturated 1,572 transform cells
across 354 of the 389 crash steps and sent them to infinity through `norm.ppf`. With the
transform corrected, the window estimates on all 389 bars with halt-masking, the robust
optimizer and the PIT clamp all **off**, and switching them on reproduces the same hit
sequence exactly. The repairs are retained because they are cheap and correct, and no
result rests on them. What the crash window now shows is not a convergence failure but the
over-conservative forecast described under "Scope" above.

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
pytest -q                 # 62 tests, including the golden master
pytest -m slow            # 2 more that each run a real fit
cd app && npx vitest run  # 176 frontend tests
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
