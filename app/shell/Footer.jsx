"use client";
// The global footer, rendered once by the shell so both surfaces carry it. It mirrors the
// tab bar's morph: light and understated on the document, a slim dark strip on the desk so
// it does not fight that layout. Its fixed terminal height is what the desk's height maths
// subtracts, so the footer sits below the desk without introducing page scroll.
import { TERMINAL_VIEW } from "./view";

export function Footer({ view }) {
  const onTerminal = view === TERMINAL_VIEW;
  return (
    <footer className={`site-footer${onTerminal ? " site-footer--terminal" : ""}`}>
      <a className="site-footer-link" href="https://modelkit.studio">
        MODELKIT.STUDIO © 2026
      </a>
      {/* The provenance key, terminal only. The tint marks which surfaces carry MODEL
          OUTPUT (estimated, can be wrong) versus plain book arithmetic (always true).
          Stated ONCE here rather than as a chip on every panel: the chip re-explained a
          global convention everywhere and crowded out each panel's own note. Naming the
          model panels in words also keeps the distinction available when colour is not —
          a grayscale print, or a colourblind reader.

          Written in tiers, widest clause dropped first, so a narrow viewport gets a SHORTER
          key rather than a key cut mid-word — the strip is one fixed-height line and the
          old single sentence clipped to "...also model-deriv". The claim that must survive
          every width is "tinted = estimated"; the parenthetical and the purple-figure
          refinement are elaborations. At phone width even "model output — estimated" does
          not fit beside the site link, so the narrowest tier restates the claim in its own
          words rather than dropping another clause off a sentence too long to begin with. */}
      {onTerminal && (
        <span className="footer-legend">
          <span className="footer-legend-swatch" aria-hidden="true" />
          <span className="footer-legend-text">
            <span className="footer-legend-narrow">Tinted = estimated</span>
            <span className="footer-legend-mid">Tinted = model output</span>
            <span className="footer-legend-wide"> (VaR · ES · correlation · fitted params)</span>
            <span className="footer-legend-mid"> — estimated.</span>
            <span className="footer-legend-wide"> Purple figures in untinted panels are also model-derived.</span>
            <span className="footer-legend-mid"> Untinted = book arithmetic.</span>
          </span>
        </span>
      )}
    </footer>
  );
}
