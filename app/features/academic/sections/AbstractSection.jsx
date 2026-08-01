// Abstract — the opening section of the single academic page. Server-rendered; the
// terminal CTA is a plain anchor to the `#terminal` fragment, which is the only thing
// this feature knows about the desk. Prose follows the thesis register: third person,
// hedged, no em dashes.
import ThesisButton from "../ThesisModal";

export default function AbstractSection() {
  return (
    <section id="abstract" className="ac-section">
      {/* The Abstract's h1 is the document title, not a section heading, so this section
          carries its tab label in the eyebrow instead. The old eyebrow ("Master's thesis ·
          refactor and extension") is not lost: the lead below says the same in full. */}
      <div className="eyebrow">Abstract</div>
      <h1>Modeling Dynamic Conditional Correlations for Intraday Risk</h1>
      <p className="lead">
        A refactor and extension of the intraday value-at-risk tool developed in a 2022
        master's thesis. The original code is rebuilt as a seeded, tested Python core,
        and the most consequential shortcomings of the original study are addressed
        and re-measured.
      </p>

      {/* Source artifact, not a citation: the page is by the same author, so a
          third-person cite in the lead read as a byline. A ruled document line states
          what the document is and opens it. */}
      <ThesisButton />

      <div className="section" style={{ paddingTop: 8 }}>
        <p>
          Financial markets exhibit interdependencies that evolve over time. Static
          correlation measures assume these relationships are fixed, and so misstate
          portfolio risk during the periods of contagion and diversification breakdown
          that matter most, typically understating it when correlations rise and
          overstating it once a stress episode has passed. The original thesis addresses
          this with the Dynamic
          Conditional Correlation framework of Engle (2002): univariate GARCH(1,1) models
          with Student-t marginals, a Gaussian copula for joint dependence, and a Monte
          Carlo value-at-risk forecast one five-minute step ahead. The forecasts were
          evaluated with a Kupiec backtest across four volatility scenarios, which rejected
          the null of correct coverage in one of the four.
        </p>
        <p>
          The present work rebuilds that pipeline as a seeded and unit-tested Python core,
          verified against a golden-master reference. It then addresses several
          shortcomings the original left open. Expected returns entered the value-at-risk
          calculation, where a five-minute drift estimate is too noisy to carry. Coverage
          was tested for its unconditional rate alone, without a companion test for the
          independence of exceedances. Most importantly, the original produced no usable
          estimate on the 2020 crash, which is the kind of event the tool was designed to
          monitor. Each change is reported as a
          before-and-after comparison against the reproduced baseline. Differences smaller
          than the Monte Carlo simulation noise are not treated as findings.
        </p>
        <p>
          Three results follow. The first concerns the crash-window failure, and it is a
          negative one. The failure is reproduced at the dimension at which it arises, and it is
          then localized three times in succession: first to circuit-breaker handling and the
          optimizer, which a pre-registered test falsified; then to a numerical saturation in
          the copula transform, which a bound was added to contain; and finally, by a later
          specification audit, to the standardization of that transform, which was itself
          incorrect. Once the transform is corrected the saturation does not arise, the window
          estimates on all 389 bars without any of the earlier repairs, and those repairs,
          although retained, carry no result. The second is that the forecast is severely
          over-conservative. On the thirty-asset portfolio every window breaches between six and
          nine times against 19.45 expected, and the unconditional coverage test rejects on
          every row, before and after the corrections alike. The third identifies the mechanism.
          The quoted value-at-risk is almost flat across the trading session while the realized
          tail is not, so exceedances concentrate at the open in every window at both portfolio
          sizes, and re-seasonalizing the forecast per slot removes the clustering the
          independence test detects almost entirely while leaving the level of the forecast
          wrong in a way that remains unexplained. That correction is therefore reported rather
          than adopted. Convergence is kept distinct from calibration throughout: the corrected
          model produces a finite, converged forecast on the crash window and still fails its
          coverage test there, and both statements are reported.
        </p>
      </div>

      <div className="ac-cta">
        <div className="ac-cta-title">The risk desk at true compute timing</div>
        <div className="ac-cta-desc">
          An interactive terminal replays a recorded run. Orders accumulate as they arrive,
          and the model reassesses risk continuously, at the wall-clock time the Python
          computation actually took on the recording machine.
        </div>
        <a href="#terminal" className="ac-cta-btn animate-diamond-shine">
          <span>Open the terminal</span>
        </a>
      </div>
    </section>
  );
}
