// Outlook - the honest "what a next pass would do" that closes the Results writeup.
//
// Only UNBUILT work belongs here: guard_pit, the 3.3 convergence result and the EXP-02
// seasonality identification are done and live in Results. Sources are Planning.md's
// "Outlook" section (the three locked directions and the staleness rule) and
// research/findings_log.md EXP-05.
//
// Each direction names the shortcoming it addresses and a reason it is motivated, rather
// than a knob turned to chase a backtest score - the overfitting guardrail. That stance is
// stated once in the lead and not repeated per item; the window-length item keeps "a
// uniform improvement would disconfirm the stated mechanism", which is a falsification
// criterion rather than a restatement.
//
// "An estimator that carries a large book" exists because Results reports the 390-bar
// identification wall: without it the writeup would raise a hard limit and never answer
// it. The Rust item is correspondingly NARROW - it shortens the cycle where the model
// still estimates and does nothing about that wall, and part of the current cost is
// sequential marginal fits rather than a language choice at all.
//
// This is the last section on the academic page, so it also carries the closing CTA into
// the terminal. Keeping it here means the explicit path and ScrollToTerminal's
// sustained-scroll gateway both sit at the document end rather than a section apart.

export default function OutlookSection() {
  return (
    <section id="outlook" className="ac-section">
      <h2 className="ac-section-title">Outlook</h2>
      <p className="lead">
        Several of the eleven shortcomings were set aside because they need a different model or
        more data. They are described here, since that is what they are: the next study rather
        than a correction to this one. Each is chosen because a mechanism can be stated for it in
        advance, and not because it is a parameter that would be turned until a backtest score
        improved.
      </p>

      <div className="divider" />

      <h3>Asymmetric marginals (leverage GARCH)</h3>
      <p>
        The specification fits a symmetric GARCH(1,1) to each series, which responds identically to a
        downward and an upward move of equal magnitude. Equity returns do not behave that way,
        since volatility tends to rise more after a loss than after a gain of the same size,
        the effect commonly termed leverage. Replacing the univariate marginals with a
        GJR-GARCH or an EGARCH specification would let the conditional variance carry that
        asymmetry. The motivation is that the asymmetry is largest in exactly the falling,
        high-volatility regime the tool exists to monitor, so the omission is expected to matter
        most on the crash window rather than on the calm control.
      </p>

      <div className="divider" />

      <h3>Tail-dependent dependence (Student-t copula)</h3>
      <p>
        The joint law is currently a Gaussian copula, whose coefficient of tail dependence is
        exactly zero, so that extreme co-movements are asymptotically independent under it. For
        an instrument whose purpose is to measure joint tail risk across a portfolio, that is
        the least defensible of the modelling assumptions, since it rules out by construction
        the simultaneous breakdowns that a contagion tool is built to see. Replacing it with a
        Student-t copula, or another copula admitting positive tail dependence, would allow
        joint extremes to co-occur at the rate observed in real dislocations.
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
        not previously apply. Once per-slot factors are load-bearing, a five-day window supplies only five
        observations per intraday slot. The prediction, recorded before any measurement, is that
        input length matters on the corrected model where it did not before, and that the gain
        concentrates in the open and close slots rather than spreading uniformly across the
        session. A uniform improvement would disconfirm the stated mechanism even if the scores
        rose. The question is registered and deliberately left unmeasured here, since a sweep
        carries the highest data-snooping risk of any experiment in this project.
      </p>

      <div className="divider" />

      <h3>Degrees of freedom at the portfolio level</h3>
      <p>
        The original specifies the portfolio's Student-t degrees of freedom as a weighted average
        of the per-asset values fitted univariately. That is a crude choice rather than an
        outright error, which is why it is not corrected above. It is still worth testing. A
        weighted average of marginal tail indices is not the tail index of the portfolio, and a
        direct portfolio-level fit would establish whether the difference matters at the
        five-minute horizon.
      </p>

      <div className="divider" />

      <h3>An estimator that carries a large book</h3>
      <p>
        The specification estimates a full unrestricted correlation matrix from a window of 390
        bars, which places an upper bound on the number of instruments it can carry that has
        nothing to do with how fast the code runs. Past a few hundred instruments the estimate is
        ill-conditioned, and past 390 it is singular, as set out under Scaling in portfolio size.
        A book of a few thousand instruments therefore needs an estimator that asks for less: a
        small number of common drivers from which the matrix is rebuilt, or an estimate pulled
        toward a simple target so that it stays invertible. Either is a change of model rather
        than of implementation.
      </p>

      <div className="divider" />

      <h3>Cross-language kernels (Rust or C++)</h3>
      <p>
        The terminal exposes the reassessment latency of the Python implementation honestly,
        and the measured timing shows that this latency lengthens under stress, from about nine
        seconds on the Dow-30 calm window to about fourteen on the crash window, which is the
        worst moment for a stale forecast. Porting the estimation kernel to Rust or C++
        would be the direct way to shorten that interval. The point of doing so in a compiled
        language rather than by relaxing the model is that the live path is held to the same
        Python baseline the backtest reports, so the honest cost is reduced rather than
        concealed.
      </p>
      <p>
        The gain from that is bounded, and the bound is worth stating. A compiled kernel shortens the
        cycle at the portfolio sizes where the model still estimates. It does nothing about the
        size limit of the item above, which belongs to the specification rather than to the
        language. Part of the present cost is not a language question either, since the marginal
        fits run one after another although they are independent. The instrument-count sweep is
        the first step for that reason: it locates the size at which latency stops being the
        binding problem, and separates the part of the cost that a faster kernel can reach from
        the part that only a different estimator can.
      </p>

      <div className="divider" />

      <p>
        Two remaining items are recorded and go no further. An extreme-value treatment of the
        univariate tails is the marginal counterpart to the copula item above. However, it requires
        more data than the parametric tail it would replace, which couples it to the
        window-length question and makes it a poor fit for a first pass. The volume-weighted
        approach to de-seasonalization, which the original attempted and abandoned in an appendix,
        is not revisited at all; the original implementation has been recovered for reference and
        nothing about it has changed.
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
