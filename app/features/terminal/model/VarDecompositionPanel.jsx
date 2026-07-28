"use client";
// Which positions cause the headline VaR. The column is the real Euler contribution
// computed in the book (features/terminal/book/riskDecomposition.js), not a pro-rating of
// the portfolio figure by position size.
//
// The tips say what the number IS before naming the maths behind it. The earlier pair led
// with "Euler allocation" and "beta to the book" and spent most of WEIGHT's words denying
// a relationship to the column beside it — the reader had to decode the derivation to find
// out what they were looking at. Each tip now defines its own column first; the
// weight ≠ VaR-share point is made once, on the column it actually concerns.
import { Panel } from "../ui/Panel";
import { SortableTable } from "../ui/SortableTable";
import { money, pct } from "../ui/format";

const COLUMNS = [
  {
    key: "ticker", label: "TICKER", align: "left",
    accessor: (row) => row.ticker, render: (row) => row.ticker, cellClass: () => "ticker",
  },
  {
    key: "weight", label: "WEIGHT",
    accessor: (row) => row.weight, render: (row) => pct(row.weight),
    tip: "Share of the book's gross exposure sitting in this name.\nHow big the position is, not how risky. Longs and shorts both count positive.",
  },
  {
    key: "componentVar", label: "COMPONENT VaR",
    accessor: (row) => row.componentVar ?? 0,
    render: (row) => (row.componentVar == null ? "—" : money(row.componentVar)),
    cellClass: (row) => (row.componentVar != null && row.componentVar < 0 ? "component-var-hedge" : ""),
    tip: "How many dollars of the portfolio VaR above this one position is responsible for.\nThe column sums to that VaR exactly. Negative = the position hedges, cutting total risk.\nNot weight × VaR: a small position that moves with the book can carry a large share.",
  },
];

export function VarDecompositionPanel({ rows, riskLive, selectedTicker, onSelectTicker }) {
  return (
    <Panel
      title="VaR Decomposition"
      note="positions live · correlations as of last reassessment"
      inert={!riskLive}
      model
    >
      <SortableTable
        columns={COLUMNS}
        rows={rows}
        rowKey={(row) => row.ticker}
        defaultSort={{ key: "componentVar", dir: "desc" }} // biggest contributors on top
        selectedKey={selectedTicker}
        onSelectRow={(row) => onSelectTicker(row.ticker)}
        tall
      />
    </Panel>
  );
}
