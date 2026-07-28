"""Regenerate the golden-master reference files.

Run once to pin the seeded baseline outputs:

    python tests/generate_golden.py

Re-run only when a *deliberate* baseline change is made; the pinned files are the
behavior-preserving anchor for the refactor.
"""

from __future__ import annotations

import json

from _golden_helpers import GOLDEN_DIR, run_scenario
from dccmgarch.scenarios import GOLDEN_MASTER_SCENARIOS


def main() -> None:
    GOLDEN_DIR.mkdir(exist_ok=True)
    prices = None
    for scenario in GOLDEN_MASTER_SCENARIOS:
        result = run_scenario(scenario, prices)
        payload = {
            "scenario": scenario.id,
            "var": result.var,
            "converged": result.converged,
            "dcc_params": result.dcc_params,
            "corr_spotlight": result.corr_spotlight,
        }
        out = GOLDEN_DIR / f"{scenario.id}.json"
        out.write_text(json.dumps(payload, indent=2))
        print(f"wrote {out.name}: var={result.var} a={result.dcc_params['a']:.5f} "
              f"b={result.dcc_params['b']:.5f} converged={result.converged}")


if __name__ == "__main__":
    main()
