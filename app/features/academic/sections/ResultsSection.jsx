// Section 3 - Results. Every figure below is derived from the artifacts rather than from
// prose:
//   research/scoreboard.csv                               Tables 2 and 4
//   research/stress30/scoreboard.csv + exhibit.md         Table 3
//   research/findings_log.md EXP-02                       Table 5, the seasonality prose
//   research/timing.json, research/stress30/timing.json   Table 6, medians recomputed
//   research/ERRATA.md ERR-01 / ERR-06                    bucket figures, saturation
//
// Two claims here are easy to weaken by accident, so they are stated deliberately:
//   - the crash bucket comparison is open against MIDDAY (ERR-01), not open against
//     afternoon, which the parallel with the calm sentence would otherwise imply;
//   - Table 3 carries LR_ind, so the thirty-asset CALM CONTROL cannot appear to pass
//     tests it in fact rejects (5.38 / 6.25).
// The compute cost of the corrections themselves is reported (5.44 s -> 8.88 s on the
// calm control), not only the absolute cycle times.
//
// "Scaling in portfolio size": the measured 3 -> 30 growth is 5.2x for 10x the assets,
// which is SUBLINEAR because fixed per-cycle cost dominates at these sizes. NO growth
// factor is fitted and nothing is extrapolated - two points do not identify a curve, and
// the one they suggest would badly understate. The argument is structural instead, and
// rests on the 390-bar estimation window (backtest/harness.py): a correlation matrix from
// 390 observations of more than 390 instruments is singular regardless of language, which
// makes institutional size an identification problem before it is a speed problem. That is
// the same pathology as the unbounded conditioning number reported on the crash window,
// reached via dimension rather than a limit move. The marginals are fitted in a plain
// sequential list comprehension with no parallelism anywhere in src/dccmgarch/, and
// pipeline.py times the whole call rather than each stage, so the stage split is stated as
// unmeasured rather than guessed.
//
// Prose follows the thesis register: third person, hedged, no em dashes. Tables are text
// only, without colour coding, and a caveat that argues is body prose - burying
// "convergence is not calibration" in small grey type under-weights the most load-bearing
// caveat in the section.

function Verdict({ reject }) {
  return <span className={reject ? "fail" : "pass"}>{reject ? "reject" : "pass"}</span>;
}

// Three-asset portfolio, results/scoreboard.csv. On the four non-crash windows the fixed
// phase carries the expected-returns correction only; on the crash it carries the
// convergence configuration (Methodology, Table 1, column 2). See the note below the table.
const ROWS = [
  { s: "calm", p: "baseline", hits: 13, uc: "2.54", ucR: false, ind: "0.59", cc: "3.12", ccR: false },
  { s: "calm", p: "fixed", hits: 12, uc: "3.46", ucR: false, ind: "0.80", cc: "4.25", ccR: false },
  { s: "volatile1", p: "baseline", hits: 17, uc: "0.34", ucR: false, ind: "0.09", cc: "0.43", ccR: false },
  { s: "volatile1", p: "fixed", hits: 17, uc: "0.34", ucR: false, ind: "0.09", cc: "0.43", ccR: false },
  { s: "volatile2", p: "baseline", hits: 19, uc: "0.01", ucR: false, ind: "10.71", cc: "10.72", ccR: true },
  { s: "volatile2", p: "fixed", hits: 19, uc: "0.01", ucR: false, ind: "10.71", cc: "10.72", ccR: true },
  { s: "volatile3", p: "baseline", hits: 14, uc: "1.77", ucR: false, ind: "0.97", cc: "2.75", ccR: false },
  { s: "volatile3", p: "fixed", hits: 13, uc: "2.54", ucR: false, ind: "0.83", cc: "3.37", ccR: false },
  { s: "crash", p: "baseline", hits: 6, uc: "13.27", ucR: true, ind: "0.16", cc: "13.43", ccR: true },
  { s: "crash", p: "fixed", hits: 7, uc: "11.01", ucR: true, ind: "0.22", cc: "11.23", ccR: true },
];

// Thirty-asset exhibit, results/stress30/. The "before" rows are deliberately shown with
// their converged fraction so they can never be read as a coverage result. LR_ind is
// carried here on purpose: the calm control fails it in both phases.
const STRESS_ROWS = [
  { s: "crash", p: "before", conv: "35 / 389", rcond: "inf / inf", hits: 2, uc: "26.61", ucR: true, ind: "0.01", indR: false, cc: "26.62", ccR: true },
  { s: "crash", p: "after", conv: "389 / 389", rcond: "125 / 137", hits: 6, uc: "13.27", ucR: true, ind: "0.16", indR: false, cc: "13.43", ccR: true },
  { s: "calm (control)", p: "before", conv: "389 / 389", rcond: "75.5 / 112", hits: 10, uc: "5.83", ucR: true, ind: "5.38", indR: true, cc: "11.22", ccR: true },
  { s: "calm (control)", p: "after", conv: "389 / 389", rcond: "76.3 / 114", hits: 9, uc: "7.32", ucR: true, ind: "6.25", indR: true, cc: "13.57", ccR: true },
];

// Phase fixed_exp02 in results/scoreboard.csv, against the fixed phase as "before".
const SEASONAL_ROWS = [
  { s: "calm", before: 12, after: 33, ind: "0.80 → 1.77", cc: "4.25 → 10.07" },
  { s: "volatile1", before: 17, after: 40, ind: "0.09 → 3.97", cc: "0.43 → 21.72" },
  { s: "volatile2", before: 19, after: 54, ind: "10.71 → 0.05", cc: "10.72 → 44.57" },
  { s: "volatile3", before: 13, after: 52, ind: "0.83 → 0.20", cc: "3.37 → 40.33" },
];

// Medians and maxima recomputed from results/timing.json and results/stress30/timing.json.
// The three volatile windows at three assets are omitted (medians 0.86 to 0.94, inside the
// band the two rows shown already span) and that omission is stated in the footnote.
const TIMING_ROWS = [
  { n: 3, w: "calm", fix: "off", med: "1.05", max: "1.61" },
  { n: 3, w: "crash", fix: "off", med: "0.83", max: "1.48" },
  { n: 3, w: "crash", fix: "on", med: "2.81", max: "9.23" },
  { n: 30, w: "calm", fix: "off", med: "5.44", max: "8.00" },
  { n: 30, w: "calm", fix: "on", med: "8.88", max: "21.74" },
  { n: 30, w: "crash", fix: "off", med: "1.68", max: "7.84" },
  { n: 30, w: "crash", fix: "on", med: "13.58", max: "28.17" },
];

const PREDICTIONS = [
  { n: 1, text: "Median value-at-risk ceases to be flat across the session", outcome: "confirmed", detail: "flatness ratio 1.001 → 3.116" },
  { n: 2, text: "Exceedances at the open fall toward their expectation", outcome: "confirmed", detail: "volatile3 open, 2 against 1.50 expected" },
  { n: 3, text: "Exceedances over the rest of the day rise toward expectation", outcome: "failed", detail: "overshoot, 50 against 17.95 expected" },
  { n: 4, text: "Total exceedances move toward 19.45", outcome: "failed", detail: "every window overshot" },
  { n: 5, text: "Independence statistic in volatile2 falls from 10.71", outcome: "confirmed", detail: "0.0485" },
];

export default function ResultsSection() {
  return (
    <section id="results" className="ac-section">
      <h2 className="ac-section-title">Results</h2>
      <p className="lead">
        All scored runs are complete. The convergence correction is tested at the dimension
        where the failure arises, on the full Dow-30 portfolio, and the seasonality correction
        is measured and reported whether or not it is adopted.
      </p>
      <p>
        Each window contains 389 one-step-ahead observations, so approximately 19.45 exceedances
        are expected at the 95% level. Likelihood-ratio statistics are compared against their χ²
        critical values, 3.84 for LR<sub>uc</sub> and LR<sub>ind</sub> and 5.99 for
        LR<sub>cc</sub>, as defined in equation (5).
      </p>

      <div className="divider" />

      <h3>Coverage on the three-asset portfolio</h3>
      <p>
        The spotlight portfolio holds Apple, JPMorgan and Chevron. It is the portfolio on which
        the methodology results and the golden-master reference were produced, and on which the
        expected-returns correction is isolated.
      </p>
      <div className="ac-fig">
        <div className="ac-fig-cap">
          <span className="ac-fig-num">Table 2.</span>
          Coverage and independence on the three-asset portfolio, baseline against fixed, five
          windows of 389 observations each.
        </div>
        <div className="ac-table-wrap">
          <table className="ac-table">
            <thead>
              <tr>
                <th>Scenario</th>
                <th>Phase</th>
                <th className="num">Hits</th>
                <th className="num">LR<sub>uc</sub></th>
                <th>Kupiec</th>
                <th className="num">LR<sub>ind</sub></th>
                <th className="num">LR<sub>cc</sub></th>
                <th>Christoffersen</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r, i) => (
                <tr key={i}>
                  <td>{r.s}</td>
                  <td className="muted">{r.p}</td>
                  <td className="num">{r.hits}</td>
                  <td className="num">{r.uc}</td>
                  <td><Verdict reject={r.ucR} /></td>
                  <td className="num">{r.ind}</td>
                  <td className="num">{r.cc}</td>
                  <td><Verdict reject={r.ccR} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="ac-table-note">
          <span className="ac-table-note-label">Note.</span> On the four non-crash windows the
          fixed phase isolates the removal of expected returns, so the difference against the
          baseline is attributable to that change alone. On the crash window the fixed phase
          carries the convergence configuration instead, since without it the window does not
          estimate.
        </p>
      </div>
      <p>
        The expected-returns correction moves little, which is the expected outcome. Over a
        five-minute horizon the drift term is small against volatility, so removing it shifts the
        loss quantile by a translation that is often within the Monte Carlo simulation noise. It is
        adopted on correctness regardless. A dispersion measure that nets out a mean is the wrong
        quantity whether or not the difference is visible in a scoreboard.
      </p>
      <p>
        The crash window at this dimension is a secondary result. A well-conditioned 3×3
        correlation matrix does not degenerate, so convergence was never the failure mode here, and
        the baseline already estimates 388 of the 389 bars. What the window shows instead is that
        the portfolio is materially conservative, producing six to seven exceedances against an
        expected 19.45 and rejecting both tests in both phases. The convergence claim cannot be
        tested where the pathology it addresses is not exercised, which is what motivates testing
        it at the dimension where the degeneracy actually arises.
      </p>

      <div className="divider" />

      <h3>Convergence on the crash window at thirty assets</h3>
      <p>
        The hypothesis was registered before any result was examined. At thirty assets the
        crash-window correlation matrix was expected to degenerate, with |R<sub>t</sub>|
        approaching zero and an unbounded conditioning number, so that the uncorrected estimation
        fails. A run on the calm window at the same dimension serves as the control, and a null
        result, in which the degeneracy does not generalize beyond the original configuration, was
        to be reported as a legitimate finding.
      </p>
      <p>
        The degeneracy is confirmed. On the crash window the conditioning number of the forecast
        correlation matrix is infinite at both the median and the maximum, and the uncorrected path
        estimates only 35 of 389 bars. The corrected model estimates all 389, at a conditioning
        number of approximately 125, which is the same order as the calm regime. The labelled
        fallback specification, retained as a safety valve, was invoked on none of the 389 bars, so
        the result reflects the intended model rather than a degraded substitute. The calm control
        estimates all 389 bars both before and after, which isolates the failure as specific to the
        crash rather than a consequence of dimension alone.
      </p>
      <div className="ac-fig">
        <div className="ac-fig-cap">
          <span className="ac-fig-num">Table 3.</span>
          Convergence, conditioning and coverage on the thirty-asset portfolio. The conditioning
          number r<sub>cond</sub> is that of the forecast correlation matrix, reported as median
          and maximum over the window. LR<sub>cc</sub> is omitted: it is the sum of the two
          statistics shown, and the Christoffersen verdict it decides is reported alongside them.
        </div>
        <div className="ac-table-wrap">
          <table className="ac-table">
            <thead>
              <tr>
                <th>Scenario</th>
                <th>Phase</th>
                <th className="num">Converged</th>
                <th className="num brk">r<sub>cond</sub> (med / max)</th>
                <th className="num">Hits</th>
                <th className="num">LR<sub>uc</sub></th>
                <th>Kupiec</th>
                <th className="num">LR<sub>ind</sub></th>
                <th className="brk">Christoffersen</th>
              </tr>
            </thead>
            <tbody>
              {STRESS_ROWS.map((r, i) => (
                <tr key={i}>
                  <td>{r.s}</td>
                  <td className="muted">{r.p}</td>
                  <td className="num">{r.conv}</td>
                  <td className="num">{r.rcond}</td>
                  <td className="num">{r.hits}</td>
                  <td className="num">{r.uc}</td>
                  <td><Verdict reject={r.ucR} /></td>
                  <td className="num">{r.ind}</td>
                  <td><Verdict reject={r.ccR} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p>
        Three qualifications attach to that table. The before rows are not interpretable as
        coverage. With 354 of 389 estimations failing, the associated value-at-risk figures are not
        usable as forecasts, and the count of two exceedances records only that the original
        produced no usable backtest on this window.
      </p>
      <p>
        Convergence is also not calibration. The corrected model still rejects both tests on the
        crash window, with six exceedances against 19.45 expected. That is a separate shortcoming,
        addressed under the seasonality result below, and the claim made here is the narrower one
        that was registered in advance.
      </p>
      <p>
        Finally, the calm control is a control for convergence and for nothing else. It rejects
        both coverage and independence in both phases, at LR<sub>ind</sub> of 5.38 before and 6.25
        after against a critical value of 3.84. The over-conservatism visible on the three-asset
        portfolio is therefore not confined to the crash or to small portfolios, and the
        corrections neither cause it nor cure it.
      </p>
      <p>
        A methodological note belongs with this table. An earlier attempt reported full convergence
        on the crash window. That report was withdrawn. The conditioning diagnostic contradicted it.
        The fallback specification hardcodes a success flag, so a run in which the fallback fired on
        364 bars presented as converged while carrying no usable value-at-risk on those bars.
      </p>
      <p>
        Diagnosing that discrepancy located the actual failure, which is numerical rather than
        optimizational. On limit-move residuals the Student-t probability integral transform
        saturates at unity in double precision. The inverse normal transform of unity is infinite,
        and every downstream correlation is then non-finite. The repair is therefore the bounded
        transform of equation (6) and not a better optimizer. It has no effect on the calm control,
        where corrected and uncorrected forecasts agree exactly.
      </p>
      <p>
        The pre-registered mechanism was consequently wrong. Halt-masking and the reparameterized
        optimizer were predicted to be the fix and they were not. Both are retained, since a halt
        is still not a zero return, but neither carries the result. The prediction is reported as
        made and as falsified.
      </p>

      <div className="divider" />

      <h3>Intraday seasonality: mechanism identified, level not resolved</h3>
      <p>
        The predicted consequence of rescaling the de-seasonalized series by a single whole-sample
        ratio, stated before it was measured, was a value-at-risk overstated in the quiet middle of
        the session and understated at the open and the close. That direction is confirmed on the
        shipped model. The median forecast is effectively flat across the session, at 450, 454, 451,
        449 and 449 for the open, morning, midday, afternoon and close buckets of the calm window,
        while the realized fifth-percentile loss is not, at 558 at the open against 249 in the
        afternoon. The crash window carries the same shape more violently, at 11,125 in the open
        bucket against 2,120 at midday. Exceedances follow, concentrating at the open in the calm
        window as well as the crash, so the pattern is not an artifact of extreme events.
      </p>
      <p>
        The correction estimates the volatility model on the de-seasonalized series and
        re-seasonalizes only the forecast, by the factor belonging to the target slot. It was
        measured on the four non-crash windows, with the crash held out as an exhibit.
      </p>
      <div className="ac-fig">
        <div className="ac-fig-cap">
          <span className="ac-fig-num">Table 4.</span>
          Effect of re-seasonalizing the forecast per slot, against the fixed phase as the
          before. Expected exceedances are 19.45 in every window.
        </div>
        <div className="ac-table-wrap">
          <table className="ac-table">
            <thead>
              <tr>
                <th>Scenario</th>
                <th className="num">Hits before</th>
                <th className="num">Hits after</th>
                <th className="num">LR<sub>ind</sub></th>
                <th className="num">LR<sub>cc</sub></th>
              </tr>
            </thead>
            <tbody>
              {SEASONAL_ROWS.map((r, i) => (
                <tr key={i}>
                  <td>{r.s}</td>
                  <td className="num">{r.before}</td>
                  <td className="num">{r.after}</td>
                  <td className="num">{r.ind}</td>
                  <td className="num">{r.cc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="ac-fig">
        <div className="ac-fig-cap">
          <span className="ac-fig-num">Table 5.</span>
          The five predictions registered before the run, scored in both directions.
        </div>
        <div className="ac-table-wrap">
          <table className="ac-table wrap">
            <thead>
              <tr>
                <th className="col-sec num">#</th>
                <th>Registered prediction</th>
                <th>Outcome</th>
                <th>Measured</th>
              </tr>
            </thead>
            <tbody>
              {PREDICTIONS.map((p) => (
                <tr key={p.n}>
                  <td className="num">{p.n}</td>
                  <td>{p.text}</td>
                  <td><Verdict reject={p.outcome === "failed"} /></td>
                  <td className="muted">{p.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p>
        Two findings follow. The first is that the clustering of
        exceedances was seasonality. The independence failure in volatile2, which is the single
        result the added independence test was introduced to catch and which the removal of
        expected returns left untouched, falls from 10.71 to 0.05 once the forecast is
        re-seasonalized per slot. That is a causal identification of the clustering rather than an
        association.
      </p>
      <p>
        The second is that the level is then wrong, in a way that has not been explained. All four
        windows breach substantially more often than expected, in the same direction and by a similar
        magnitude. A systematic cause is therefore indicated rather than estimation scatter. A units
        error and silent rescaling inside the estimation library were both excluded by inspection.
        The conditioning route was excluded as well, because the pure de-seasonalized path admits
        no alternative scale. The leading explanation remains unproven. It is that normalizing by
        seasonal factors estimated on the same rolling window removes part of the genuine
        conditional level along with the seasonal component.
      </p>
      <p>
        A correction of this kind is normally kept on grounds of correctness, since allowing a
        backtest score to veto a demonstrably correct change is itself a form of selection on
        outcome. What withheld it here is not the score but an unexplained systematic bias, which is
        a technical signal of the same class as the abort criteria registered in advance. The
        argument stands; what is unproven is this implementation of it on a five-day estimation
        window, where each intraday slot contributes only five observations to a factor the forecast
        now depends on.
      </p>

      <div className="divider" />

      <h3>Multiple testing</h3>
      <p>
        The original study reports four backtests at the 95% level without correcting for
        multiplicity, which carries an 18.6% probability of at least one false rejection under the
        null. Applying a Bonferroni allocation raises the per-test level to 0.0125 and the critical
        values to 6.24 and 8.76 for one and two degrees of freedom respectively, in place of 3.84
        and 5.99. Two consequences follow, in opposite directions.
      </p>
      <p>
        The adverse finding of the original study does not survive the correction. Its single
        rejection, at a test statistic of 4.197, corresponds to p = 0.040 and falls short of the
        corrected threshold, so the inference that the model struggles during increases in
        volatility is not supported by that statistic once multiplicity is accounted for. The
        finding reported here does survive it. The conditional-coverage rejection in volatile2, at
        10.72, corresponds to p = 0.0047 and remains significant under the Holm procedure at its
        smallest step of 0.0125. The independence failure is therefore robust to the correction that
        removes the original's only rejection.
      </p>

      <div className="divider" />

      <h3>Computation time</h3>
      <p>
        The original study asserts that two to four seconds is sufficient for minute-by-minute
        updating, without a breakdown, while its application refreshes every twenty seconds. The
        question is answerable directly, since the terminal and the backtest call the same
        estimation function and the wall-clock duration of every cycle is recorded. Table 6 states
        the measured cost.
      </p>
      <div className="ac-fig">
        <div className="ac-fig-cap">
          <span className="ac-fig-num">Table 6.</span>
          Wall-clock duration of one estimation cycle, in seconds, over the 389 cycles of each
          window.
        </div>
        <div className="ac-table-wrap">
          <table className="ac-table">
            <thead>
              <tr>
                <th className="num">Assets</th>
                <th>Window</th>
                <th>Corrections</th>
                <th className="num">Median</th>
                <th className="num">Max</th>
              </tr>
            </thead>
            <tbody>
              {TIMING_ROWS.map((r, i) => (
                <tr key={i}>
                  <td className="num">{r.n}</td>
                  <td>{r.w}</td>
                  <td className="muted">{r.fix}</td>
                  <td className="num">{r.med}</td>
                  <td className="num">{r.max}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="ac-table-note">
          <span className="ac-table-note-label">Note.</span> The uncorrected thirty-asset crash
          row is faster only because the estimation abandons early on most of its bars, and it is
          not comparable with the others. The three volatile windows at three assets are omitted;
          their medians of 0.86 to 0.94 seconds fall inside the band the two rows shown already
          span.
        </p>
      </div>
      <p>
        The claim of two to four seconds holds only for a small portfolio in a quiet regime, and
        the twenty-second refresh interval of the original application is better read as an
        accommodation of the true cost than as a design choice. Cycle time also rises with stress,
        by about half again between the calm and crash windows at thirty assets, so the forecast is
        at its most stale precisely when it matters most.
      </p>
      <p>
        The corrections are not free. On the thirty-asset calm control, where they change no
        result, they raise the median cycle from 5.44 to 8.88 seconds, an increase of about 63%.
        That is the cost of a forecast that remains finite under a limit move.
      </p>

      <div className="divider" />

      <h3>Scaling in portfolio size</h3>
      <p>
        Two portfolio sizes were timed, and only two. Between them a tenfold increase in the number
        of assets costs about five times the compute, at 1.05 seconds against 5.44 on the calm
        window without corrections. That is slower than proportional, and it should not be read as
        encouraging. At these sizes a cycle is dominated by costs that do not grow with the
        portfolio at all, so the growth rate observable here is the part of the curve before it
        bends. Two points also do not identify a curve, so no growth factor is fitted here and
        nothing is extrapolated from it.
      </p>
      <p>
        The structural terms are known regardless. The number of distinct correlations is
        n(n−1)/2, which is 435 for the Dow-30 and close to two million for a book of two thousand
        instruments. The DCC recursion touches every one of them at every bar, so that stage grows
        with the square of the count, while the factorization required to draw correlated Monte
        Carlo paths grows with its cube. Only the marginal fits grow linearly. A cycle of nine
        seconds at thirty assets therefore constrains a cycle at two thousand very weakly.
      </p>
      <p>
        A harder limit arrives before that one. Each estimate is taken on a window of 390
        five-minute bars, and a correlation matrix estimated from 390 observations of more than 390
        instruments is singular by construction, in any language and at any speed. Well below that
        count it is merely ill-conditioned, which is the pathology this work already reports on the
        crash window, where the conditioning number of the forecast correlation matrix was
        unbounded. There it was reached through a limit move rather than through dimension, but the
        failure is the same one. At institutional portfolio size the binding constraint on this
        specification is therefore that it stops being estimable, and not that it is slow.
      </p>
      <p>
        Two consequences follow for a production setting. A book of a few thousand instruments
        cannot be carried by this specification as written, and what it would need is an estimator
        that does not ask for a full unrestricted correlation matrix, whether by building the
        matrix from a small number of common drivers or by pulling the estimate toward a simple
        target so that it stays invertible. Separately, the cycle times above are properties of
        this implementation as much as of the method, since the marginal fits are performed one
        after another although they are independent of one another. The split of a cycle between
        the marginal stage and the correlation stage was not measured, so how much of the nine
        seconds is recoverable without changing the model is not established here. The sweep that
        would locate where the curve bends, timing the same pipeline at three, six, nine, eighteen
        and thirty assets, is registered and was not run.
      </p>

      <div className="divider" />

      <h3>Power of the test windows</h3>
      <p>
        A limitation constrains every result above. A 389-observation window yields about nineteen
        expected exceedances, and the independence test is evaluated on that hit sequence. It is
        therefore under-powered by construction. The crash window makes this concrete. With six
        exceedances the independence statistic is 0.16, which reflects an absence of evidence rather
        than evidence of independence. The blind spot is also structural rather than merely one of
        sample size. The exceedance concentration documented above is clustering in time of day.
        The test, however, examines dependence between consecutive observations, and a first-order
        Markov alternative cannot represent a pattern that recurs at the same hour on different
        days. Lengthening the windows would benefit both coverage and independence testing, and
        finite-sample critical values would be preferable to the asymptotic ones at this length.
        The estimation window, which is a separate question from the scoring window, is taken up
        under Outlook.
      </p>
    </section>
  );
}
