// Section 3 - Results. Every figure below is derived from the artifacts rather than from
// prose:
//   research/scoreboard.csv                               Tables 2 and 4
//   research/stress30/scoreboard.csv + exhibit.md         Table 3
//   research/findings_log.md EXP-02                       Table 5, the seasonality prose
//   research/timing.json                                  Table 6, N=3 rows (389 cycles)
//   single-process 40-cycle re-measurement, post-correction   Table 6, N=30 rows
//   research/ERRATA.md ERR-01 / ERR-06                    bucket figures, saturation
//
// ALL figures were regenerated on the corrected specification (ERR-04 PIT standardization,
// ERR-05 copula draw + nu relabel, ERR-07 DCC forecast). Anything quoted from before that
// correction is labelled as such in the prose and never mixed into a table.
//
// The section's spine CHANGED when those corrections landed, and the change is the point:
//   - the §3.3 crash-convergence result is now a NULL. The baseline runs guard_pit OFF and
//     still converges 389/389 at r_cond 115, so halt-masking, the robust optimizer, the
//     bounded transform and the CCC fallback are all retained but load-bearing for nothing.
//     Do NOT reinstate any "the fix restored convergence" phrasing.
//   - OVER-COVERAGE is the primary result now: Kupiec rejects on every N=30 row, 6-9 hits
//     against 19.45, in both windows and both phases.
//   - the intraday-seasonality mechanism is what the over-coverage is MADE OF (28 of 65
//     N=3 exceedances in the opening half hour, which expects 7.5).
//
// Claims here that are easy to weaken by accident, so they are stated deliberately:
//   - the crash bucket comparison is open against MIDDAY (ERR-01), not open against
//     afternoon, which the parallel with the calm sentence would otherwise imply;
//   - Table 3 carries LR_ind, so the thirty-asset CALM CONTROL cannot appear to pass
//     tests it in fact rejects (6.25 / 7.26);
//   - multiplicity uses the BONFERRONI BOUND (<= m*alpha), never 1-0.95^n, which assumes an
//     independence these overlapping windows and linked statistics do not have. Family is
//     counted honestly at m=54 and the clustering finding does NOT survive it. That is
//     reported, not softened.
//
// "Scaling in portfolio size": the measured 3 -> 30 growth is ~6x for 10x the assets, which
// is SUBLINEAR (tenfold input, sixfold cost) because fixed per-cycle cost dominates at
// these sizes. NO growth factor is fitted and nothing is extrapolated - two points do not
// identify a curve. The argument is structural instead, and rests on the 390-bar estimation
// window (backtest/harness.py): 390 bars give 389 returns, demeaned data of that length has
// rank <= 388, so the correlation matrix is singular at N >= 389 regardless of language.
// The marginals are fitted in a plain sequential list comprehension with no parallelism
// anywhere in src/dccmgarch/, and pipeline.py times the whole call rather than each stage,
// so the stage split is stated as unmeasured rather than guessed.
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
  { s: "calm", p: "baseline", hits: 12, uc: "3.46", ucR: false, ind: "0.80", cc: "4.25", ccR: false },
  { s: "calm", p: "fixed", hits: 12, uc: "3.46", ucR: false, ind: "0.80", cc: "4.25", ccR: false },
  { s: "volatile1", p: "baseline", hits: 17, uc: "0.34", ucR: false, ind: "0.09", cc: "0.43", ccR: false },
  { s: "volatile1", p: "fixed", hits: 17, uc: "0.34", ucR: false, ind: "0.09", cc: "0.43", ccR: false },
  { s: "volatile2", p: "baseline", hits: 15, uc: "1.16", ucR: false, ind: "10.41", cc: "11.57", ccR: true },
  { s: "volatile2", p: "fixed", hits: 17, uc: "0.34", ucR: false, ind: "8.37", cc: "8.71", ccR: true },
  { s: "volatile3", p: "baseline", hits: 12, uc: "3.46", ucR: false, ind: "0.70", cc: "4.16", ccR: false },
  { s: "volatile3", p: "fixed", hits: 12, uc: "3.46", ucR: false, ind: "0.70", cc: "4.16", ccR: false },
  { s: "crash", p: "baseline", hits: 6, uc: "13.27", ucR: true, ind: "0.16", cc: "13.43", ccR: true },
  { s: "crash", p: "fixed", hits: 7, uc: "11.01", ucR: true, ind: "0.22", cc: "11.23", ccR: true },
];

// Thirty-asset exhibit, results/stress30/. Every row now converges on all 389 bars and
// r_cond is finite throughout: the degeneracy the pre-registered hypothesis predicted is
// absent once the PIT is correctly standardized, so the before and after rows are
// identical on the crash. LR_ind is carried here on purpose: the calm control fails it in
// both phases.
const STRESS_ROWS = [
  { s: "crash", p: "before", conv: "389 / 389", rcond: "115 / 139", hits: 6, uc: "13.27", ucR: true, ind: "0.16", indR: false, cc: "13.43", ccR: true },
  { s: "crash", p: "after", conv: "389 / 389", rcond: "128 / 143", hits: 6, uc: "13.27", ucR: true, ind: "0.16", indR: false, cc: "13.43", ccR: true },
  { s: "calm (control)", p: "before", conv: "389 / 389", rcond: "72.6 / 106", hits: 9, uc: "7.32", ucR: true, ind: "6.25", indR: true, cc: "13.57", ccR: true },
  { s: "calm (control)", p: "after", conv: "389 / 389", rcond: "73.7 / 108", hits: 8, uc: "9.04", ucR: true, ind: "7.26", indR: true, cc: "16.29", ccR: true },
];

// Phase fixed_exp02 in results/scoreboard.csv, against the fixed phase as "before".
// Re-measured on the corrected core: the mechanism survives the correction (volatile2
// LR_ind collapses further than it did before), the level failure survives it too.
const SEASONAL_ROWS = [
  { s: "calm", before: 12, after: 32, ind: "0.80 → 1.53", cc: "4.25 → 8.72" },
  { s: "volatile1", before: 17, after: 38, ind: "0.09 → 3.26", cc: "0.43 → 18.01" },
  { s: "volatile2", before: 17, after: 52, ind: "8.37 → 0.0002", cc: "8.71 → 40.13" },
  { s: "volatile3", before: 12, after: 51, ind: "0.70 → 0.10", cc: "4.16 → 38.10" },
];

// N=3 rows: research/timing.json, medians over all 389 cycles.
// N=30 rows: a single-process 40-cycle re-measurement on an idle machine, taken after the
// specification corrections because the committed stress30/timing.json predates them and
// the parallel stress driver deliberately writes no honest timing. 40 cycles is ample for a
// median and the truncation is stated in the footnote.
// The three volatile windows at three assets are omitted (medians 1.01 to 1.02, inside the
// band the two rows shown already span) and that omission is stated in the footnote.
const TIMING_ROWS = [
  { n: 3, w: "calm", fix: "off", med: "1.10", max: "1.75" },
  { n: 3, w: "crash", fix: "off", med: "0.87", max: "1.48" },
  { n: 3, w: "crash", fix: "on", med: "1.70", max: "5.55" },
  { n: 30, w: "calm", fix: "off", med: "6.32", max: "7.16" },
  { n: 30, w: "calm", fix: "on", med: "10.77", max: "25.34" },
  { n: 30, w: "crash", fix: "off", med: "6.05", max: "6.44" },
  { n: 30, w: "crash", fix: "on", med: "9.36", max: "18.34" },
];

// Re-scored on the corrected core. Prediction 5 was registered against a pre-correction
// LR_ind of 10.71; the same statistic is 8.37 under the corrected specification, so the
// prediction is scored against the value it now starts from and that substitution is
// stated in the prose rather than hidden in the number.
const PREDICTIONS = [
  { n: 1, text: "Median value-at-risk ceases to be flat across the session", outcome: "confirmed", detail: "calm flatness ratio 1.005 → 2.904" },
  { n: 2, text: "Exceedances at the open fall toward their expectation", outcome: "confirmed", detail: "volatile3 open, 4 → 2 against 1.50 expected" },
  { n: 3, text: "Exceedances over the rest of the day rise toward expectation", outcome: "failed", detail: "overshoot, volatile3 49 against 17.95 expected" },
  { n: 4, text: "Total exceedances move toward 19.45", outcome: "failed", detail: "every window overshot, 32 to 52" },
  { n: 5, text: "Independence statistic in volatile2 falls from its pre-correction 10.71", outcome: "confirmed", detail: "8.37 → 0.0002" },
];

export default function ResultsSection() {
  return (
    <section id="results" className="ac-section">
      <h2 className="ac-section-title">Results</h2>
      <p className="lead">
        All scored runs are complete and every figure below was produced on the corrected
        specification. A specification audit carried out after the first round of results found
        four material inconsistencies between the model this study documents and the model its
        code computed: the standardization of the Student-t probability integral transform, the
        one-step correlation forecast, the Monte Carlo draw, and the label attached to a
        degrees-of-freedom summary. All four are corrected, unconditionally rather than behind a
        toggle, and every artifact quoted here was regenerated afterwards. The corrections are
        set out in the errata ledger that ships with the source. One of them changes what this
        section can claim, and that is reported first rather than last.
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
          carries the convergence configuration instead. That configuration was adopted because
          the uncorrected specification could not estimate the window; under the corrected
          specification it is no longer needed, and both phases estimate all 389 bars.
        </p>
      </div>
      <p>
        The expected-returns correction moves almost nothing, and what movement there is does not
        survive its own noise floor. On three of the four non-crash windows the baseline and fixed
        phases produce an identical hit sequence. Only volatile2 moves at all, from 15 exceedances
        to 17. A Monte Carlo noise floor was measured for exactly this question, by repeating both
        phases of both a calm and a volatile window under six seeds and recording the paired,
        per-seed difference between them. The two phases share a seed, so their simulation draws
        are correlated and the paired difference rather than the spread of either level is the
        relevant floor. On volatile2 that paired difference ranges from zero to two exceedances
        across the six seeds, and it is exactly zero on two of them. The observed difference of
        two is therefore the largest value the floor itself produces, and by this study's own
        acceptance rule it is inconclusive rather than a finding. That is the expected outcome. Over a
        five-minute horizon the drift term is small against volatility, so removing it shifts the
        loss quantile by a translation that is generally smaller than the simulation noise. It is
        adopted on correctness rather than on effect: an estimated conditional mean at this
        horizon is negligible and very imprecisely estimated, so carrying it imports noise for no
        benefit and biases the quantile in the forgiving direction.
      </p>
      <p>
        The crash window at this dimension is a secondary result. A well-conditioned 3×3
        correlation matrix does not degenerate, so convergence was never the failure mode here.
        What the window shows instead is that the portfolio is materially conservative, producing
        six to seven exceedances against an expected 19.45 and rejecting both tests in both
        phases. That over-conservatism, and not the convergence question, turns out to be the
        finding that generalizes.
      </p>

      <div className="divider" />

      <h3>The crash window at thirty assets: a failure that dissolved</h3>
      <p>
        The hypothesis was registered before any result was examined. At thirty assets the
        crash-window correlation matrix was expected to degenerate, with |R<sub>t</sub>|
        approaching zero and an unbounded conditioning number, so that the uncorrected estimation
        fails. A run on the calm window at the same dimension serves as the control, and a null
        result, in which the degeneracy does not generalize beyond the original configuration, was
        to be reported as a legitimate finding. This is that null, and it arrived by an unexpected
        route.
      </p>
      <p>
        The failure was real when it was first observed. On the uncorrected code the conditioning
        number of the forecast correlation matrix was infinite at both the median and the maximum,
        and the estimation completed on only 35 of the 389 bars. It was then localized three
        times, and each localization displaced the one before it.
      </p>
      <p>
        The first attributed it to circuit-breaker handling and to the optimizer, and predicted
        that treating halted bars as missing data and reparameterizing the correlation fit would
        restore convergence. That prediction was registered in advance and it was falsified: both
        changes were made, and neither recovered the window.
      </p>
      <p>
        The second located it in the copula transform rather than in the optimizer, which was
        correct as far as it went. On limit-move residuals the Student-t probability integral
        transform saturated at exactly unity in double precision. The inverse normal transform of
        unity is infinite, and a single saturated cell makes every downstream correlation
        non-finite. The repair adopted was therefore the bounded transform of equation (6), which
        clamps the transform away from its endpoints before inverting it, and that did recover the
        window.
      </p>
      <p>
        The third came from the specification audit, and it displaced the second. The transform
        was saturating because it was mis-standardized. The library reports a conditional standard
        deviation and the code divided by its square root, and it fits a Student-t standardized to
        unit variance while the distribution function applied was the ordinary one, whose variance
        is ν/(ν−2). Neither error is a numerical-precision issue, and the first is the one that
        did the damage: the fitted marginal degrees of freedom on this data are large enough that
        the unit-variance rescale is worth about a factor of 1.003, while dividing by the square
        root of a standard deviation is not even scale-invariant and pushed standardized residuals
        far enough into the tail that the transform reached unity.
      </p>
      <p>
        The effect is directly measurable, since both transforms can be applied to the same fitted
        residuals. Over the 389 crash-window steps at thirty assets, the original transform
        saturates on 1,572 cells spread across 354 of the 389 steps. The corrected transform
        saturates on none, on any step. Its most extreme value comes within 2 × 10⁻³⁰ of zero,
        which the inverse normal maps to a large but finite number, so no downstream correlation
        can become non-finite. That last point is why the bound is retained and also why it is not
        the answer: the corrected transform still produces values the bound would clamp, so the
        bound is not inert, but there is no longer a domain violation for it to prevent.
      </p>
      <p>
        The consequence is visible in Table 3, and it is a null. The baseline phase, which runs
        with every one of these repairs switched off, now completes on all 389 crash bars at a
        conditioning number of 115, the same order as the calm regime, and the repaired
        configuration produces an
        identical hit sequence. There is no convergence failure left for halt-masking, the
        reparameterized optimizer, the bounded transform or the fallback specification to repair.
        All four are retained, since each is defensible on its own terms and none is expensive to
        keep, but none of them carries a result and no claim in this study rests on them. The
        fallback specification was invoked on none of the 389 bars in either phase.
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
        Three qualifications attach to that table. The first is that the substantive result in it
        is not the convergence column, which is now uniform, but the coverage columns, which
        reject everywhere. Both windows at thirty assets breach far less often than expected, at
        six against 19.45 on the crash and eight or nine on the calm control, and unconditional
        coverage is rejected on every row in both phases.
      </p>
      <p>
        The second is that the calm control now controls for more than it was designed to. It was
        included to establish that any crash-window failure was specific to the crash rather than
        to dimension. With no failure left to isolate, what it shows instead is that the
        over-conservatism is not a crash phenomenon and not a small-portfolio phenomenon. It also
        rejects independence in both phases, at LR<sub>ind</sub> of 6.25 before and 7.26 after
        against a critical value of 3.84, so the calm regime at thirty assets fails both
        dimensions of the test.
      </p>
      <p>
        The third is that the corrections make the calm control marginally worse rather than
        better, from nine exceedances to eight and from an LR<sub>cc</sub> of 13.57 to 16.29.
        The movement is small and in the wrong direction, and it is reported rather than
        explained.
      </p>
      <p>
        A methodological note belongs with this table, because the sequence above was not the
        first correction to it. An earlier attempt reported full convergence on the crash window
        and that report was withdrawn, because the conditioning diagnostic contradicted it: the
        fallback specification hardcodes a success flag, so a run in which the fallback fired on
        364 bars presented as converged while carrying no usable value-at-risk on those bars. That
        withdrawal is what motivated reporting a conditioning number alongside a convergence flag
        in the first place, and it is why the flag alone is not treated as evidence here.
      </p>
      <p>
        Two lessons are worth separating from the result. The first is that a diagnosis can be
        correct in its location and wrong in its cause: the failure genuinely was in the copula
        transform and not in the optimizer, and the bound genuinely did recover the window, yet
        the bound was treating a symptom of an error one level below it. The second is that a
        repair which works is not thereby evidence that the thing it repaired was understood. The
        bounded transform passed every check applied to it, including a sensitivity sweep across
        the clamp width, and it was still not the answer.
      </p>

      <div className="divider" />

      <h3>Intraday seasonality: mechanism identified, level not resolved</h3>
      <p>
        The predicted consequence of rescaling the de-seasonalized series by a single whole-sample
        ratio, stated before it was measured, was a value-at-risk overstated in the quiet middle of
        the session and understated at the open and the close. That direction is confirmed on the
        shipped model. The median forecast is effectively flat across the session, at 459, 464, 461,
        459 and 458 for the open, morning, midday, afternoon and close buckets of the calm window,
        while the realized fifth-percentile loss is not, at 558 at the open against 249 in the
        afternoon. The crash window carries the same shape more violently, at 11,125 in the open
        bucket against 2,120 at midday. Exceedances follow. Across the five windows of the
        three-asset portfolio, 28 of the 65 exceedances fall in the opening half hour, which
        expects 7.5 of them, while the remaining 37 fall in a stretch of the session that expects
        89.8. The same concentration appears at thirty assets and in the calm windows as well as
        the crash, so the pattern is not an artifact of extreme events. It is also what the
        aggregate over-conservatism reported above is made of: the forecast is far too high for
        most of the session and too low at the open, and a test that aggregates over the whole
        window sees only the net.
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
        Two findings follow. The first is that the clustering of exceedances is consistent with
        intraday seasonality. The independence failure in volatile2, which is the single result
        the added independence test was introduced to catch and which the removal of expected
        returns leaves rejecting, falls from 8.37 to 0.0002 once the forecast is re-seasonalized
        per slot. That is mechanistic evidence rather than a causal identification. It is a
        software ablation on one selected window, not a design that rules out the alternatives,
        and a single ablation that removes a symptom does not establish that it removed the cause.
        The ablation was also first measured under the pre-correction transform and has been
        re-measured here; the collapse survives the correction and is in fact more complete than
        it was, which is reassuring but does not change what kind of evidence it is.
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
        multiplicity. It is tempting to quantify that as a familywise error rate of 1 − 0.95⁴, or
        18.6%, but that figure holds only for independent tests, and these are not independent:
        the windows are drawn from one price series by one methodology and the three statistics
        are arithmetically linked, since LR<sub>cc</sub> is the sum of the other two. What can be
        stated without an independence assumption is the Bonferroni bound, that the familywise
        error rate is at most mα for m tests at level α.
      </p>
      <p>
        The family also has to be counted honestly, and it is larger than four. This study reports
        five windows in two phases at three assets, two windows in two phases at thirty, and a
        further four windows for the seasonality ablation, each scored on three statistics: 54
        tests in total. A Bonferroni allocation at that size sets the per-test level to 0.000926
        and the critical values to 10.97 and 13.97 for one and two degrees of freedom, in place of
        3.84 and 5.99. That is a demanding threshold, and it was not chosen to be flattering.
      </p>
      <p>
        Eleven of the 54 survive it, and which eleven is the informative part. The over-coverage
        rejections do. Unconditional coverage on the crash window is rejected at both portfolio
        sizes and in both phases, at p = 2.7 × 10⁻⁴ for the baseline at either dimension, and the
        conditional-coverage rejection on the thirty-asset calm control survives at p = 2.9 ×
        10⁻⁴. So does every coverage rejection produced by the seasonality ablation. The clustering
        result does not. The independence failure in volatile2 corresponds to p = 0.0038 in the
        fixed phase and 0.0013 in the baseline, both comfortably significant at the conventional
        level and neither surviving a correction for a family this size.
      </p>
      <p>
        The adverse finding of the original study does not survive either. Its single rejection, at
        a test statistic of 4.197, corresponds to p = 0.040, so the inference that the model
        struggles during increases in volatility is not supported by that statistic once
        multiplicity is accounted for at any plausible family size. The honest summary is
        therefore that one finding in this study is robust to multiplicity and the other is not,
        and that the robust one is the over-conservatism rather than the clustering.
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
          <span className="ac-table-note-label">Note.</span> The three-asset rows are medians over
          all 389 cycles of each window. The thirty-asset rows are a separate single-process
          measurement over 40 cycles, taken on an idle machine after the specification
          corrections, since the earlier thirty-asset timing predates them and the parallel
          stress driver records no honest timing by design. A cycle median is a timing statistic
          rather than a coverage claim, so the shorter roll costs precision and not validity.
          Before the corrections the thirty-asset crash row read 1.68 seconds, but only because
          the estimation abandoned early on most of its bars; now that every bar estimates, it is
          comparable with the others. The three volatile windows at three assets are omitted;
          their medians of 1.01 to 1.02 seconds fall inside the band the two rows shown already
          span.
        </p>
      </div>
      <p>
        The claim of two to four seconds holds only for a small portfolio in a quiet regime, and
        the twenty-second refresh interval of the original application is better read as an
        accommodation of the true cost than as a design choice. An earlier version of this section
        reported that cycle time rises with stress, so that the forecast would be at its most
        stale precisely when it matters most. That is withdrawn. It rested on a thirty-asset crash
        measurement taken while the estimation was abandoning early on most of its bars. Measured
        on the corrected specification, the crash window is slightly cheaper than the calm window
        at thirty assets in both configurations, at 6.05 seconds against 6.32 and 9.36 against
        10.77. Stress does not systematically raise the cost of a cycle here.
      </p>
      <p>
        The repairs, on the other hand, are not free, and this is the one place their cost is
        visible. On the thirty-asset calm control they raise the median cycle from 6.32 to 10.77
        seconds, an increase of about 70%, and on the crash window from 6.05 to 9.36, about 55%.
        At three assets the proportional cost is higher still, from 0.87 seconds to 1.70 on the
        crash. Since Table 3 shows the same repairs changing no scored outcome, that is the
        cleanest statement of the null: between 55 and 95 percent of the cycle is being spent on
        machinery which, under the corrected specification, buys nothing measurable. It is
        retained on the argument that a guard against a real domain violation is worth keeping,
        not on any evidence that it is currently doing work.
      </p>

      <div className="divider" />

      <h3>Scaling in portfolio size</h3>
      <p>
        Two portfolio sizes were timed, and only two. Between them a tenfold increase in the number
        of assets costs about six times the compute, at 1.10 seconds against 6.32 on the calm
        window without the repairs. That is sublinear, since a tenfold increase in input buys
        roughly a sixfold increase in cost, and it should not be read as
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
        Carlo paths grows with its cube. Only the marginal fits grow linearly. A cycle of nine to eleven
        seconds at thirty assets therefore constrains a cycle at two thousand very weakly.
      </p>
      <p>
        A harder limit arrives before that one. Each estimate is taken on a window of 390
        five-minute bars, which yields 389 returns, and demeaned data of that length spans a
        subspace of dimension at most 388, so a correlation matrix estimated from it is singular by
        construction once the number of instruments reaches 389, in any language and at any speed.
        Well below that
        count it is merely ill-conditioned, which is the pathology this work reported on the
        crash window before the specification was corrected, where the conditioning number of the
        forecast correlation matrix was
        unbounded. There it was reached through a defective transform rather than through dimension, but the
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
        the marginal stage and the correlation stage was not measured, so how much of that
        time is recoverable without changing the model is not established here. The sweep that
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
