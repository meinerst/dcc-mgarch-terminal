"""Backtest harness: how the model is *scored*, never how it is computed.

Everything here consumes ``dccmgarch.pipeline.one_step_var`` read-only and turns its
output into evidence — hit sequences, coverage statistics, scoreboards. The model is
never reimplemented on this side of the boundary, because a backtest that scores a
different model than the one shipped proves nothing about the one shipped.
"""

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

# Every scored artifact goes here. One definition, so relocating the research record is
# a one-line change rather than a hunt through eight drivers.
RESULTS_DIR = REPO_ROOT / "research"

__all__ = ["REPO_ROOT", "RESULTS_DIR"]
