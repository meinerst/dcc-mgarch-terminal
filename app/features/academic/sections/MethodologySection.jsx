// Section 2 - model and specification.
//
// Formula rule: DEFINE WHAT THIS WORK ADDED, CITE THE THESIS FOR WHAT IT INHERITED. The
// thesis derives the GARCH-t marginals, the Gaussian copula, the Kupiec statistic and the
// seasonal adjustment, and it is embedded on this page, so repeating them here is padding.
// Equations (5) and (6) are this work's additions and are therefore defined: the
// Christoffersen sequence (named but never implemented in the original) and the bounded
// transform that repairs the crash window.
//
// The configuration table is a COLUMN PER CONSUMER, read off the files themselves.
// backtest/run_fixed.py, backtest/run_crash.py, backtest/run_stress30.py and
// src/dccmgarch/live/config.py each instantiate a DIFFERENT FixConfig, so any single
// sentence claiming one configuration for the backtest, the exhibit and the terminal at
// once would be false.
//
// Prose follows the thesis register: third person, hedged, no em dashes. A note that
// tells the reader how to read a table is a `.ac-table-note` attached to that table;
// anything that argues is body prose.
export default function MethodologySection() {
  return (
    <section id="methodology" className="ac-section">
      <h2 className="ac-section-title">Methodology</h2>
      <p className="lead">
        Volatilities and correlations are modelled separately and then recombined. That
        decomposition is what makes a time-varying covariance matrix tractable in higher
        dimensions.
      </p>

      <div className="divider" />

      <h3>The model</h3>
      <p>
        Financial returns exhibit volatility clustering. Turbulent periods tend to follow
        turbulent periods, and calm periods follow calm. A GARCH(1,1) captures this by letting
        the conditional variance depend on the previous squared shock and the previous
        variance, rather than treating variance as constant.
      </p>
      <div className="ac-eq">
        <div className="eq">σ²<sub>t</sub> = ω + α·ε²<sub>t−1</sub> + β·σ²<sub>t−1</sub></div>
        <div className="eq-num">(1)</div>
        <div className="eq-label">Univariate GARCH(1,1) conditional variance.</div>
      </div>
      <p>
        A portfolio requires the joint distribution rather than a single series. However,
        modelling every variance and covariance directly is intractable. For n assets there are
        n(n−1)/2 distinct correlations, or 435 for the Dow-30. The DCC framework instead
        decomposes the conditional covariance matrix into a diagonal of GARCH volatilities and a
        separately evolving correlation matrix. Each asset therefore retains a simple univariate
        fit, and only the correlation structure of the standardized residuals is modelled
        dynamically.
      </p>
      <div className="ac-eq">
        <div className="eq">H<sub>t</sub> = D<sub>t</sub> R<sub>t</sub> D<sub>t</sub></div>
        <div className="eq-num">(2)</div>
        <div className="eq-label">Conditional covariance decomposition.</div>
      </div>
      <p>
        In the first stage, each asset's de-seasonalized five-minute return series is fitted with
        a GARCH(1,1) under Student-t innovations. This yields the conditional volatilities in
        D<sub>t</sub> together with a set of standardized residuals. In the second stage those
        residuals drive a DCC recursion for the quasi-correlation matrix Q<sub>t</sub>. The
        process mean-reverts toward the long-run average Q̄ while responding to recent
        co-movements. It is then rescaled to a valid correlation matrix with unit diagonal.
      </p>
      <div className="ac-eq">
        <div className="eq">
          Q<sub>t</sub> = (1 − α − β)·Q̄ + α·(ε<sub>t−1</sub>ε′<sub>t−1</sub>) + β·Q<sub>t−1</sub>
        </div>
        <div className="eq-num">(3)</div>
        <div className="eq-label">DCC evolution. α governs sensitivity to recent shocks, β governs persistence.</div>
      </div>
      <div className="ac-eq">
        <div className="eq">
          R<sub>t</sub> = diag(Q<sub>t</sub>)<sup>−1/2</sup> Q<sub>t</sub> diag(Q<sub>t</sub>)<sup>−1/2</sup>
        </div>
        <div className="eq-num">(4)</div>
        <div className="eq-label">Normalization to a correlation matrix.</div>
      </div>
      <p>
        In the third stage the residuals are mapped through a Gaussian copula and 5,000 Monte
        Carlo draws are simulated one five-minute step ahead. The fifth percentile of the
        simulated portfolio profit and loss is the 95% value-at-risk, reported as a loss
        magnitude against the current mark. This one-step-ahead
        intraday forecast, rather than the original end-of-day view, is the quantity the terminal
        reassesses continuously.
      </p>
      <p>
        The Student-t marginals, the Gaussian copula, the Kupiec coverage statistic and the
        Taylor and Xu seasonal adjustment are inherited from the original study, which derives
        each of them. They are not re-derived here; the thesis is linked from the abstract above.
      </p>

      <div className="divider" />

      <h3>What this work adds</h3>
      <p>
        The original tests unconditional coverage only. A test of coverage alone cannot see
        whether exceedances arrive independently or in bursts. That is, a model may breach the
        right number of times in the wrong pattern and still pass. The Christoffersen sequence
        adds a likelihood-ratio test of independence against a first-order Markov alternative on
        the hit sequence. The conditional-coverage statistic is then the sum of the two.
      </p>
      <div className="ac-eq">
        <div className="eq">LR<sub>cc</sub> = LR<sub>uc</sub> + LR<sub>ind</sub> ~ χ²(2)</div>
        <div className="eq-num">(5)</div>
        <div className="eq-label">
          Conditional coverage. LR<sub>uc</sub> is the Kupiec statistic and LR<sub>ind</sub> the
          independence statistic, each χ²(1). Critical values at the 95% level are 3.84 and 5.99.
        </div>
      </div>
      <p>
        The second addition is numerical. On limit-move residuals the Student-t probability
        integral transform saturates at exactly zero or one in double precision. The inverse
        normal transform of one is infinite. Therefore a single saturated cell makes every
        downstream correlation non-finite. The transform is now bounded away from its endpoints
        before it is inverted. Wherever the transform is already interior, the bound leaves the
        value unchanged.
      </p>
      <div className="ac-eq">
        <div className="eq">û = min(max(u, ε), 1 − ε),&nbsp;&nbsp; ε = 10<sup>−6</sup></div>
        <div className="eq-num">(6)</div>
        <div className="eq-label">
          Bounded probability integral transform, applied before the inverse normal step. This is
          the substantive repair on the crash window.
        </div>
      </div>

      <div className="divider" />

      <h3>The configurations that produced the results</h3>
      <p>
        Every correction is a named switch on one function. The original behaviour is retained as
        the default, so that each change is measurable as a difference rather than a replacement.
        Four configurations appear in this work, and they are not identical. Table 1 states each
        one.
      </p>
      <div className="ac-fig">
        <div className="ac-fig-cap">
          <span className="ac-fig-num">Table 1.</span>
          The four configurations. Each column is a distinct switch setting, read from the driver
          that produced the corresponding result. Baseline, not shown, has every switch off.
        </div>
        <div className="ac-table-wrap">
          <table className="ac-table">
            <thead>
              <tr>
                <th>Switch</th>
                <th>Non-crash windows</th>
                <th>Crash, 3 assets</th>
                <th>Crash, 30 assets</th>
                <th>Terminal</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code>include_expected_returns</code></td>
                <td>off</td><td>off</td><td>off</td><td>off</td>
              </tr>
              <tr>
                <td><code>mask_halts</code></td>
                <td className="muted">off</td><td>on</td><td>on</td><td>on</td>
              </tr>
              <tr>
                <td><code>robust_optimizer</code></td>
                <td className="muted">off</td><td>on</td><td>on</td><td>on</td>
              </tr>
              <tr>
                <td><code>guard_pit</code></td>
                <td className="muted">off</td><td className="muted">off</td><td>on</td><td>on</td>
              </tr>
              <tr>
                <td><code>fallback_ccc_on_fail</code></td>
                <td className="muted">off</td><td>on</td><td className="muted">off</td><td>on</td>
              </tr>
              <tr>
                <td><code>reseasonalize_forecast</code></td>
                <td className="muted">off</td><td className="muted">off</td><td className="muted">off</td><td className="muted">off</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="ac-table-note">
          <span className="ac-table-note-label">Note.</span> The columns differ for reasons that
          are themselves results. On the four non-crash windows only the expected-returns switch is
          thrown, so the measured difference against the baseline is attributable to that change
          alone. The three-asset crash column predates the bounded transform and carries the
          constant-correlation fallback instead. The thirty-asset column is the one the convergence
          claim rests on, and it runs with the fallback switched off, so a converged bar is a
          genuinely converged bar and not a labelled substitute. The terminal keeps the fallback on,
          since a live desk that produces no number at all is worse than one that produces a number
          marked as degraded. The seasonality switch is off everywhere; it was measured on its own
          phase and not adopted.
        </p>
      </div>
      <p>
        A conditioning number for the forecast correlation matrix is recorded alongside every
        estimate. It is recorded independently of the optimizer's own success flag, and that
        redundancy is deliberate. One path through the code sets the success flag
        unconditionally, so the flag is not self-evidencing. Where the two disagree, the
        conditioning number is the honest diagnostic. It is what caught the misdiagnosis reported
        below.
      </p>
    </section>
  );
}
