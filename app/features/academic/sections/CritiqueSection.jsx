// Section 1 - the selection rule, then the defects it selected.
//
// The selection rule is quoted from the project's own locked planning doc
// (projectdocs/Planning.md, "Research core - the marquee fixes" plus guardrail 1), which
// was written BEFORE any result existed. That provenance is the point: a criterion stated
// after the results are known is not a criterion.
//
// No shortcomings ledger closes this section. A table of eleven rows, seven of them
// reading "not done" with a tidy disposition, is a project tracker in a paper's clothing
// and invites the same question seven times. The completeness claim it carried survives as
// one sentence in the opening, and the deferred items with a real mechanism live in
// Outlook, which is where unbuilt work belongs.
//
// Prose register, matched to the 2022 thesis on a re-read of its sections 1-3: short
// declaratives, connective openers, plain vocabulary, third person, hedged, no em dashes.
// Deliberately NOT imported from the thesis: "the researcher", footnoted asides, and
// "this section is structured as follows" roadmaps. Those are thesis-format obligations
// rather than voice.
//
// Method commitments are plain prose rather than indented notes, and sit next to the
// selection rule because they are the same kind of claim.
export default function CritiqueSection() {
  return (
    <section id="critique" className="ac-section">
      <h2 className="ac-section-title">Critique</h2>
      <p className="lead">
        A review of the original study identified eleven shortcomings. Four of them are
        objective errors and are corrected here. A fifth is measured in full and deliberately
        not adopted. The remainder require a different model specification or more data, and
        they are set out under Outlook.
      </p>

      <h3>How the four were chosen</h3>
      <p>
        The selection rule was fixed before any result was examined. A correction had to carry
        a stated theoretical justification, and that justification had to hold before its
        backtest number was looked at. An improvement in a score is not a reason to keep a
        change. It is the symptom that overfitting produces, so a change adopted on the
        strength of its score is indistinguishable from a change that improved by chance.
      </p>
      <p>
        Three further rules governed the measurement. The evaluation windows were pinned in
        advance and never re-picked after a result was seen. The crash window was treated as an
        exhibit and never as a tuning target, since tuning a parameter until the crash passes
        would destroy the before-and-after comparison that makes it evidence. And every attempt
        was logged, including the ones that failed, so that a single success among many attempts
        cannot be read as a strong result.
      </p>
      <p>
        The order of work was fixed as well. The model had to converge before it was scored, and
        it had to be scored on the untouched pipeline before any correction was measured against
        it. Without that baseline, an improvement has nothing to improve on.
      </p>
      <p>
        Three corrections met the rule and were chosen at the outset. Removing expected
        returns from the value-at-risk was unambiguous and cheap. The independence test ran on
        a hit sequence the backtest already produced, so it required no re-estimation and no
        further simulation. Convergence on the crash window was neither cheap nor certain, but
        it was chosen anyway, because the crash is the event the tool exists to monitor and the
        original could not estimate it.
      </p>
      <p>
        Two further shortcomings were answered without being selected. Both fell out of
        infrastructure built for other reasons. The wall-clock duration of every estimation
        cycle was already recorded, which answers the original's unsupported performance claim
        directly. The correction for multiple testing is arithmetic on statistics that had
        already been computed. Neither cost anything, so both are reported.
      </p>
      <p>
        Everything else was set aside on cost. A Student-t copula or an asymmetric GARCH
        specification means a different model. A longer estimation window means more data and a
        re-derivation of every scenario index.
      </p>

      <div className="divider" />

      <h3>Expected returns entered the value-at-risk</h3>
      <p>
        The diversification effect of the original study (Figure 12) added expected returns to
        the Monte Carlo draw before the loss quantile was taken. A drift term therefore entered
        a dispersion measure. Over a five-minute horizon that term is negligible against
        volatility, and its sign biases the result, since a positive drift understates the loss
        quantile. The text of the original concedes the point on page 35. The application
        retains the error regardless.
      </p>
      <p>
        The value-at-risk is now taken on the zero-drift distribution. The change is a pure
        translation of every simulated portfolio value, so its effect is small. It is adopted on
        correctness, not on its effect.
      </p>

      <h3>Independence of exceedances was never tested</h3>
      <p>
        The original tested unconditional coverage with the Kupiec test. It named the
        Christoffersen test without implementing it, and it observed clustered exceedances in
        one scenario. Its central claim is that intraday responsiveness produces independent
        exceedances. That claim therefore remained untested by the study that made it.
      </p>
      <p>
        The full likelihood-ratio sequence now runs on the hit sequence the backtest already
        produces. This is an extension rather than a repair. It is also the only addition that
        changed which windows are considered to have failed.
      </p>

      <h3>Estimation failed on the crash window</h3>
      <p>
        The motivating example of the original study is a flash crash. However, its estimation
        fails on the 2020 crash week, reported there as a sequence of optimizer errors. The one
        window the tool exists to monitor is therefore the one window it could not produce a
        forecast for. Its central claim rests on the scenarios where nothing went wrong.
      </p>
      <p>
        Three changes address this. Circuit-breaker bars are detected and treated as missing
        data rather than as genuine zero returns, since a halt is an absence of trading and not
        evidence of zero volatility. The correlation parameters are reparameterized so that the
        fit is unconstrained, which removes the boundary behaviour the original optimizer ran
        into. And the probability integral transform is bounded before it is inverted.
      </p>
      <p>
        Only the third turned out to matter. The first diagnosis was wrong, and Results reports
        how that was found.
      </p>

      <h3>Intraday seasonality was reinstated before estimation</h3>
      <p>
        The original de-seasonalizes its return series. It then rescales that series back to its
        original magnitude by a single whole-sample ratio (Figure 3, line 19). The intraday
        variance pattern is therefore put back before the volatility model is estimated. A
        single global factor cannot re-seasonalize per slot, so the forecast is scaled to the
        average volatility of the trading day rather than to the five-minute slot it forecasts.
        The predicted consequence is a value-at-risk overstated in the quiet middle of the
        session and understated at the open and the close. That is the wrong direction for the
        events the tool is built to see.
      </p>
      <p>
        The correction estimates the volatility model on the de-seasonalized series and
        re-seasonalizes only the forecast, by the factor belonging to the target slot.
        Correlations are scale-free, so the dependence structure is untouched by it. It was
        measured in full and it is not adopted; see Results.
      </p>
    </section>
  );
}
