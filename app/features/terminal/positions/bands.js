// Shading bands for the diversification-effect column.
//
// The cutoffs are ABSOLUTE, not per-render quantiles of the visible rows, so a name's
// shade means the same thing from one reassessment to the next. A relative scale would
// restyle the whole column whenever the book changed, and the eye reads that as the values
// themselves moving.
//
// They are MEASURED, not guessed: the value is signed and unbounded above, so its range
// depends on how long or short the orderflow gets. `python -m private.recorder.inspect_bands`
// pools every name-bar across both recordings and prints the distribution; these three
// cutoffs are its quartiles. Re-run it after a re-record.
//
// Re-measured against the 2026-07-27 single-session bake (1259 pooled name-bars, calm +
// crash): observed range 0.0995 .. 1.7029, quartiles 0.4045 / 0.6203 / 1.2283. The cutoffs
// below are those quartiles rounded, and they hold 24.5 / 25.4 / 25.0 / 25.0 percent of the
// mass — every edge inside the observed range, no band empty.
//
// Re-checked against the 2026-07-31 bake, the first on the corrected specification (ERR-04 /
// ERR-05 / ERR-07): 1259 pooled name-bars, range 0.1002 .. 1.6995, quartiles 0.3964 / 0.6217
// / 1.2304. The cutoffs below are unchanged and still hold 25.4 / 24.5 / 24.9 / 25.1 percent.
// The distribution barely moved because the seeded tape and therefore the book are identical;
// only the correlation and volatility forecasts feeding the split changed.
//
// The middle edge moved 0.49 -> 0.62 because the grid did: the previous bake strode five
// trading days, this one plays one session, so the book is younger and less hedged and the
// low cluster sits higher. Carrying the old 0.49 forward would have left the second band
// holding a tenth of the rows.
//
// The distribution is BIMODAL — a cluster below ~0.6 (positions moving with the book) and
// a second above 1 (positions hedging it), with little between — so the top edge sits
// inside the hedge cluster rather than grading a continuum. Values above 1 fall into the
// top band naturally; no special case.
export function divEffectBand(value) {
  if (value < 0.4) return "q1";
  if (value < 0.62) return "q2";
  if (value < 1.23) return "q3";
  return "q4";
}
