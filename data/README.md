# data/

`prices.csv` holds 5-minute bars for 30 large-cap US equities, trimmed to the fifty trading
days that the five evaluation windows read.

Derived from licensed intraday market data and anonymized by ticker relabelling: each column
header is a placeholder code (`XA`, `XB`, ... `ZG`), using three-letter symbols that are
unassigned or reserved on US exchanges so none of them reads as a real company. Column order
is preserved, because it indexes the correlation matrix. The mapping back to securities is
not in this repository.

The data ships so the model runs out of the box on a fresh clone. It is not covered by the
repository's MIT license (see `LICENSE`) and is not redistributable. If you need market data
for your own work, source it from a provider you are licensed with. The pipeline reads plain
CSVs, a timestamp column and one column per asset, so substituting your own series is a file
swap rather than a code change.

## Format

Column 0 is the bar timestamp, the remaining 30 are one asset each, holding the VWAP price
for that 5-minute bar. `src/dccmgarch/data.py` is the only reader. `src/dccmgarch/scenarios.py` pins the five
evaluation windows by date and resolves them to row indices at load time with a self-check,
so a trimmed file either locates every window at full size or fails loudly.
