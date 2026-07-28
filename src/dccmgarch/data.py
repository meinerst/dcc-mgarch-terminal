"""Price panel loading, the one place the bar file is read.

Every consumer (pipeline callers, the live desk, the backtest harness, the recorder)
goes through here, so the dataset's location and its ticker order are resolved once.
The files are 5-minute bars for 30 large-cap US equities.

The universe is read from the price file's header rather than hardcoded, so the bar
files are the single source of truth for both the names and their order.
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd

# The package lives at <repo>/src/dccmgarch, the bars at <repo>/data.
DATA_DIR = Path(__file__).resolve().parents[2] / "data"
PRICES_CSV = DATA_DIR / "prices.csv"

def _read_universe(path: Path) -> list[str]:
    """The investable universe, in the bar file's own column order.

    Order is load-bearing — it indexes the N x N correlation matrix in the serving
    payload, so a reordering would silently re-label every cell in a recorded run.
    It is therefore taken from the header rather than restated here: the file already
    defines the order, and a second copy in source is a second thing that can
    disagree with it. Reading it makes the two impossible to desynchronize.
    """
    if not path.exists():
        raise FileNotFoundError(
            f"bar file not found: {path}. The 5-minute panels live in <repo>/data."
        )
    with path.open(encoding="utf-8") as fh:
        header = fh.readline().rstrip("\r\n")
    columns = [c.strip() for c in header.split(",")]
    if not columns or columns[0] != "date":
        raise ValueError(f"{path.name}: expected a leading 'date' column, got {columns[:1]}")
    return columns[1:]


# Read once at import: every consumer treats this as a fixed list for the process.
UNIVERSE = _read_universe(PRICES_CSV)


def _read_bars(path: Path) -> pd.DataFrame:
    if not path.exists():
        raise FileNotFoundError(
            f"bar file not found: {path}. The 5-minute panels live in <repo>/data."
        )
    return pd.read_csv(path).set_index("date")


def load_prices() -> pd.DataFrame:
    """5-minute close prices, indexed by timestamp, one column per ticker."""
    return _read_bars(PRICES_CSV)
