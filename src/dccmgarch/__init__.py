"""Clean DCC-MGARCH intraday risk core.

Single source of truth for the model that both the desk and the backtest call.
Interfaces: docs/ARCHITECTURE.md section 2.
"""

# One module-level default seed; every stochastic call threads an explicit seed
# derived from it. No bare np.random.* anywhere in the core.
DEFAULT_SEED = 20220101

# Intraday sampling constants (5-min bars, US regular session = 390 min).
BARS_PER_DAY = 78
HISTORY_DAYS = 5

__all__ = ["DEFAULT_SEED", "BARS_PER_DAY", "HISTORY_DAYS"]
