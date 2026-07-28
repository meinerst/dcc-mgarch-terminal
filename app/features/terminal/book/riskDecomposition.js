// Euler decomposition of portfolio VaR — pure, and the only place this maths lives.
//
//   H_ij = sigma_i * sigma_j * R_ij        forecast covariance of RETURNS
//   x_i                                    signed DOLLAR exposure (shares * price)
//   v = x'Hx                               portfolio P&L variance, dollars^2
//   componentVar_i = x_i (Hx)_i / v * VaR  the shares sum to 1, so these sum to VaR
//   divEffect_i    = 1 - sign(x_i) * rho(i, portfolio)
//
// The split has NO residual because the desk runs zero-drift through an elliptical
// Student-t draw: VaR = k * sigma_p is then homogeneous of degree 1 in the exposures, so
// Euler's theorem applies exactly rather than approximately.
//
// Both outputs are left SIGNED and UNCLAMPED. A negative component VaR and a
// diversification effect above 1 are the most informative states the book can reach — the
// position is hedging — and clamping would throw away something the model genuinely
// computed. divEffect reads: 0 = moves with the book (no diversification), 1 =
// uncorrelated, above 1 = actively cutting portfolio risk.

/**
 * Hx and x'Hx — the two quantities everything else here is a ratio of.
 * `null` when the book carries no risk (empty, flat, or a degenerate covariance).
 */
function riskTerms(universe, exposures, sigma, corr) {
  if (!sigma || !corr) return null;

  const n = universe.length;
  const hx = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let acc = 0;
    for (let j = 0; j < n; j++) acc += sigma[j] * corr[i][j] * exposures[j];
    hx[i] = sigma[i] * acc;
  }

  const variance = exposures.reduce((sum, x, i) => sum + x * hx[i], 0); // x'Hx, dollars^2
  if (!Number.isFinite(variance) || variance <= 0) return null;
  return { hx, variance };
}

/**
 * Portfolio P&L standard deviation in DOLLARS, sqrt(x'Hx), under a landed forecast.
 *
 * The desk revalues between fits with this: VaR = k * sigma_p is homogeneous of degree 1
 * in the exposures (see above), so the quantile multiplier `k` backed out of a landed fit
 * reprices the SAME forecast against a book that has since moved. Exported rather than
 * inlined there so the covariance contraction lives in one file only.
 */
export function portfolioSigmaDollars({ universe, exposures, sigma, corr }) {
  const terms = riskTerms(universe, exposures, sigma, corr);
  return terms ? Math.sqrt(terms.variance) : null;
}

/**
 * @param {string[]} universe   ticker order indexing `corr` and `sigma`
 * @param {number[]} exposures  signed dollar exposure per universe entry
 * @param {number[]} sigma      per-asset forecast standard deviation, return units
 * @param {number[][]} corr     forecast correlation matrix
 * @param {number} portfolioVar the headline VaR, in dollars
 * @returns {{componentVar: (number|null)[], divEffect: (number|null)[]}|null}
 *   `null` when the book carries no risk to split (an empty or perfectly flat book).
 */
export function eulerRiskSplit({ universe, exposures, sigma, corr, portfolioVar }) {
  if (portfolioVar == null) return null;
  const terms = riskTerms(universe, exposures, sigma, corr);
  if (terms === null) return null;

  const n = universe.length;
  const { hx, variance } = terms;
  const portfolioSigma = Math.sqrt(variance);

  const componentVar = new Array(n).fill(null);
  const divEffect = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    const component = ((exposures[i] * hx[i]) / variance) * portfolioVar;
    if (Number.isFinite(component)) componentVar[i] = component;
    // sign(0) is 0, which would make a flat name read as perfectly uncorrelated (1.0)
    // rather than as absent. A flat position has no diversification effect to report.
    if (exposures[i] === 0 || !(sigma[i] > 0)) continue;
    const effect = 1 - Math.sign(exposures[i]) * (hx[i] / (sigma[i] * portfolioSigma));
    if (Number.isFinite(effect)) divEffect[i] = effect;
  }
  return { componentVar, divEffect };
}
