"use client";
// Shown when the DCC optimizer failed and the constant-correlation fallback took over.
// It names the DIRECTION of the error, not just the fact of it: holding correlation fixed
// while it is spiking understates the tail, so a viewer must not read these numbers as
// merely approximate.
export function DegradedBanner() {
  return (
    <div className="degraded-banner">
      ⚠ DEGRADED — DCC optimizer did not converge; constant-correlation (CCC) fallback in
      use. Tail risk is understated: correlation is held fixed while it is spiking. Not the
      intended model.
    </div>
  );
}
