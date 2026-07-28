"use client";
// A labelled figure, for the small stat rows inside a panel.
import { symbolize } from "./symbols";
import { InfoTip } from "./InfoTip";

export function Stat({ label, value, tip }) {
  return (
    <div>
      <div className="terminal-metric-label">
        {symbolize(label)}
        {tip && <InfoTip text={tip} />}
      </div>
      <div className="stat-value">{value}</div>
    </div>
  );
}
