// Outlook - the scope verdict that closes the Results writeup, and what follows from it.
//
// This section used to be a roadmap: six directions framed as "what a next pass would do".
// That framing is retired. The study's conclusion is that the specification is misfit for
// 5-minute data (a daily-returns model applied intraday, with Taylor-Xu as a patch on the
// mismatch), so items that refine THIS specification are no longer a next pass - they are a
// description of what a different model class would have to supply. The lead states the
// verdict once and the items are scoped by it.
//
// Two former items were CUT rather than reframed, because the study's own evidence
// contradicts them: the Student-t copula and the asymmetric-marginals item both propose
// richer tails, while the fitted marginal nu of 268-339 says the estimation finds no fat
// tail to model. Proposing them as remedies would argue against Results. The nu finding
// itself is kept - it is the evidence, not the remedy.
//
// The estimator-size limit and the latency bound are retained unchanged in substance: both
// are properties of the specification and are true regardless of the verdict.
//
// The window-length item's "deliberately left unmeasured" was STALE - the per-slot question
// was measured (findings_log EXP-02, re-ground under EXP-06): mechanism confirmed, coverage
// regressed, cause unresolved. It now reports that outcome instead of registering it as open.
//
// This is the last section on the academic page, so it also carries the closing CTA into
// the terminal. Keeping it here means the explicit path and ScrollToTerminal's
// sustained-scroll gateway both sit at the document end rather than a section apart.

export default function OutlookSection() {
  return (
    <section id="outlook" className="ac-section">
      <h2 className="ac-section-title">Outlook</h2>
      <p className="lead">
        The conclusion this study reaches is about fit rather than about tuning. DCC is specified
        and validated on daily returns, and applying it to five-minute bars asks it to carry a
        diurnal shape it has no term for. The Taylor and Xu filter is a patch on that mismatch,
        and the results say the patch does not carry the model: the forecast is flat across the
        session while the realised tail concentrates at the open, and the per-slot correction that
        addresses the mismatch directly confirmed its mechanism while regressing coverage on every
        window. What follows is therefore not a list of improvements to this specification. It is
        what a different model class would have to supply, and what remains true about this one
        regardless.
      </p>

      <div className="divider" />

      <h3>Measuring the covariance rather than inferring it</h3>
      <p>
        The specification infers variance from squared returns, which is the daily-data method.
        Intraday data admits a different one: with observations arriving through the session, the
        covariance can be measured directly from the ticks rather than filtered out of a return
        series, and the estimators built for that purpose are robust to the two properties of
        high-frequency prices this model has no defence against, namely the noise in an observed
        price and the fact that two instruments do not trade at the same instants. Realised
        covariance and its noise-robust and asynchronicity-robust forms, such as realised kernels
        and the Hayashi-Yoshida estimator, are the measurement step; the measured series is then
        modelled in its own right, by a heterogeneous autoregressive specification or by
        realised-data variants of DCC. Neither the noise nor the asynchronicity is measured in
        this project, and that is a limit of what is claimed here rather than a result.
      </p>
      <p>
        This is a change of model class rather than a parameter of the present one, which is the
        reason it closes the study instead of extending it.
      </p>

      <div className="divider" />

      <h3>Length of the estimation window</h3>
      <p>
        Table 5 of the original study sweeps the estimation window from five to forty-five days
        and concludes that additional input data does not improve the forecast. That conclusion
        runs against a
        recommendation in the literature of roughly one thousand observations, and it deserves
        re-testing for a specific reason. It was reached on a model whose error was a bias.
        Additional data reduces variance, not bias. The absence of improvement is therefore the
        expected signature of the defect rather than a property of the data.
      </p>
      <p>
        The seasonality correction also raises the requirement on window length in a way that did
        not previously apply. Once per-slot factors are load-bearing, a five-day window supplies
        only five observations per intraday slot. That correction was measured rather than left
        open, and the outcome is reported under Results: it identified the mechanism decisively,
        moving the clustering statistic on volatile2 from 8.37 to 0.0002, and it regressed
        coverage uniformly across all four windows at the same time. The cause of that level bias
        is not established, and a window long enough to identify per-slot factors is the leading
        unproven explanation rather than a demonstrated one.
      </p>

      <div className="divider" />

      <h3>Marginals that are Student-t in name only</h3>
      <p>
        The original specifies the portfolio's Student-t degrees of freedom as a weighted average
        of the per-asset values fitted univariately, and applies that single parameter to the
        joint draw. This was originally set aside as a crude choice rather than an error. The
        specification audit established that it was neither: the draw it belonged to was not a
        Gaussian copula, and the averaged parameter went with it when the simulation was
        corrected. Each asset now carries its own fitted tail through its own quantile function,
        and the single number the terminal still displays is an exposure-weighted mean of those
        marginal values, retained for display and used in no computation.
      </p>
      <p>
        Correcting the label exposed a larger problem underneath it. Measured across the
        evaluation windows on the corrected specification, the fitted marginal degrees of freedom
        have a median of 268 on the crash window, 324 on the calm and 339 on volatile2, against
        an upper bound of 500 imposed by the fitter. A Student-t distribution at those values is
        a normal distribution for every practical purpose, so the marginals as fitted carry
        essentially no excess kurtosis. The specification names a fat-tailed innovation and the
        estimation does not find one.
      </p>
      <p>
        This bears on the scope conclusion rather than sitting beside it. The obvious remedies for
        a model that cannot represent a simultaneous extreme are richer tails, a Student-t copula
        in place of the Gaussian one or an asymmetric marginal specification, and this result
        argues against reaching for them here: the estimation is not finding a fat tail that a
        richer parameterization would then carry. Whether that reflects five-minute returns that
        are genuinely close to conditionally normal once volatility is filtered, an estimation
        window too short to identify a tail index, or an interaction with the seasonal filter, is
        not established here and belongs to a specification that measures its covariance rather
        than inferring it.
      </p>

      <div className="divider" />

      <h3>Two limits that hold regardless of the verdict</h3>
      <p>
        The specification estimates a full unrestricted correlation matrix from a window of 390
        bars, which yields 389 returns, which places an upper bound on the number of instruments
        it can carry that has nothing to do with how fast the code runs. Past a few hundred
        instruments, the estimate is ill-conditioned, and at 389 instruments or more it is
        singular, as set out under Scaling in portfolio size. A book of a few thousand instruments
        therefore needs an estimator that asks for less: a small number of common drivers from
        which the matrix is rebuilt, or an estimate pulled toward a simple target so that it stays
        invertible. That is a property of the estimator rather than of the implementation, and it
        would apply equally to a specification built on measured covariances.
      </p>
      <p>
        Latency is the second. The terminal exposes the reassessment cost of the Python
        implementation honestly: a corrected cycle on the Dow-30 runs to roughly eleven seconds on
        the calm window and longer still on the crash window, against a market that does not wait.
        Whether stress systematically lengthens the cycle is not settled by the present
        measurement, for the reason given under Computation time, so the observation rests on the
        level rather than on a difference between regimes. A compiled kernel would shorten that
        interval at the sizes where the model still estimates, and part of the present cost is not
        a language question at all, since the marginal fits run one after another although they
        are independent. Neither reaches the size limit above, and neither reaches the fit
        problem, which is why a faster implementation of this specification was not pursued.
      </p>

      <div className="divider" />

      <p>
        Two remaining items are recorded and go no further. An extreme-value treatment of the
        univariate tails would face the same objection as the copula and asymmetry remedies above,
        since it presumes a tail the estimation does not find, and it requires more data than the
        parametric tail it would replace. The volume-weighted approach to de-seasonalization,
        which the original attempted and abandoned in an appendix, is not revisited at all; the
        original implementation has been recovered for reference and nothing about it has changed.
      </p>

      {/* Closing CTA: the explicit path from the end of the thesis into the live desk.
          Reuses the Abstract's .ac-cta card (different copy so it reads as a conclusion,
          not a repeat). The sustained-scroll auto-advance is a progressive enhancement
          layered on top of this button, never a replacement for it. */}
      <div className="ac-cta">
        <div className="ac-cta-title">See the model in action</div>
        <div className="ac-cta-desc">
          The terminal replays a recorded run at true compute timing, so that value-at-risk
          and the correlation matrix reassess bar by bar as orders arrive.
        </div>
        <a href="#terminal" className="ac-cta-btn animate-diamond-shine">
          <span>Open the terminal</span>
        </a>
      </div>
    </section>
  );
}
