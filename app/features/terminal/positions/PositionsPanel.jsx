"use client";
// Every name the desk has traded: size, entry, exposure and the P&L split.
//
// All of it is book arithmetic (always true) except DIV. EFFECT, which is model output —
// hence the one tinted column header in an otherwise untinted table.
import { Panel } from "../ui/Panel";
import { SortableTable } from "../ui/SortableTable";
import { money, num, signedMoney, signedShares } from "../ui/format";
import { divEffectBand } from "./bands";

const COLUMNS = [
  {
    key: "ticker", label: "TICKER", align: "left",
    accessor: (row) => row.ticker, render: (row) => row.ticker, cellClass: () => "ticker",
  },
  {
    key: "shares", label: "SHARES",
    accessor: (row) => row.shares, render: (row) => signedShares(row.shares),
    cellClass: (row) => (row.shares >= 0 ? "positive" : "negative"),
  },
  {
    key: "marketPrice", label: "MKT PX",
    accessor: (row) => row.marketPrice,
    render: (row) => (row.marketPrice == null ? "—" : money(row.marketPrice, 2)),
    tip: "Market price: the last bar's mid for this name, the level the position is marked at.",
  },
  {
    // Coloured by the sign of the unrealized P&L: green when the position is in profit,
    // whichever side it is on.
    key: "inventoryPrice", label: "INV PX",
    accessor: (row) => row.inventoryPrice,
    render: (row) => (row.inventoryPrice == null ? "—" : money(row.inventoryPrice, 2)),
    cellClass: (row) =>
      row.inventoryPrice == null ? "" : row.unrealized >= 0 ? "positive" : "negative",
    tip: "Inventory price: average entry price of the open position (average-cost, not FIFO). Compare against MKT PX to read inventory P&L.",
  },
  {
    key: "exposure", label: "EXPOSURE",
    accessor: (row) => row.exposure, render: (row) => money(row.exposure),
  },
  {
    key: "realized", label: "REALIZED P&L",
    accessor: (row) => row.realized, render: (row) => signedMoney(row.realized),
    cellClass: (row) => (row.realized >= 0 ? "positive" : "negative"),
  },
  {
    key: "unrealized", label: "INVENTORY P&L",
    accessor: (row) => row.unrealized, render: (row) => signedMoney(row.unrealized),
    cellClass: (row) => (row.unrealized >= 0 ? "positive" : "negative"),
  },
  {
    // Non-negative by construction (a half-spread on both sides of the book), so it is
    // hard-coded positive rather than sign-tested: a negative here would be a bug.
    key: "spreadPnl", label: "SPREAD P&L",
    accessor: (row) => row.spreadPnl, render: (row) => signedMoney(row.spreadPnl),
    cellClass: () => "positive",
    tip: "Income from quoting both sides: every fill crosses half the simulated 0.1% bid-ask spread in the desk's favour, so this accrues on traded notional.\nRiskless and only ever increases — it never gives back, which is why it is shown apart from inventory P&L.",
  },
  {
    key: "totalPnl", label: "TOTAL P&L",
    accessor: (row) => row.totalPnl, render: (row) => signedMoney(row.totalPnl),
    cellClass: (row) => (row.totalPnl >= 0 ? "positive" : "negative"),
    tip: "Realized + inventory + spread P&L.",
  },
  {
    // The one model-driven column in an otherwise arithmetic table, so it carries the
    // provenance tint on the header itself — there is no room for a chip.
    key: "divEffect", label: "DIV. EFFECT",
    accessor: (row) => row.divEffect,
    headClass: "div-effect-head", sticky: true,
    // Magnitude rides on the value's own weight rather than a separate bar, so the column
    // stays scannable without a second mark to read.
    render: (row) => row.divEffect == null ? "—" : (
      <span className={`div-effect-val ${divEffectBand(row.divEffect)}`}>{num(row.divEffect, 2)}</span>
    ),
    tip: "How much of this position's own risk the book cancels out. Higher is more diversified.\n0 = moves exactly with the book, so it contributes its full standalone risk. 1 = uncorrelated. Above 1 = it hedges, actively reducing portfolio risk.\nComputed as 1 minus the position's correlation to the rest of the book, signed by the position.",
  },
];

export function PositionsPanel({ rows, selectedTicker, onSelectTicker }) {
  return (
    <Panel title="Portfolio Positions" note="click a row to make it the correlation reference">
      <SortableTable
        columns={COLUMNS}
        rows={rows}
        rowKey={(row) => row.ticker}
        defaultSort={{ key: "exposure", dir: "asc" }} // biggest shorts on top, longs below
        selectedKey={selectedTicker}
        onSelectRow={(row) => onSelectTicker(row.ticker)}
        tall
      />
    </Panel>
  );
}
