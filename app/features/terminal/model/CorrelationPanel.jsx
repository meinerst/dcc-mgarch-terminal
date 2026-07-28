"use client";
// The fitted correlation matrix, and the history of whichever pair is selected.
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Panel } from "../ui/Panel";
import { ChartTip, chartXs, linePath, sampleAge, useCrosshair } from "../ui/charts";
import { corrColor, num } from "../ui/format";

const MATRIX_HISTORY_LIMIT = 120;

/**
 * `spotlightAssets` is the full payload universe and ONLY indexes the matrix.
 * `activeAssets` is what the book actually holds — the display axis. Keeping them apart
 * matters: reindexing the matrix by the held subset would silently read the wrong pair.
 */
function CorrelationPanelImpl({
  spotlightAssets, activeAssets, latest, latestIndex, riskLive,
  selectedTicker, selectionSource, onSelectTicker,
}) {
  // History of full matrices in ORIGINAL asset order — the reordering below is display
  // only, and the chart looks values up by original index, so the plotted series never
  // scrambles when the axes move.
  const matrixHistory = useRef([]);
  if (latest?.corr && latestIndex >= 0) {
    const history = matrixHistory.current;
    const last = history[history.length - 1];
    if (last && latestIndex < last.index) history.length = 0; // a restarted run
    if (history.length === 0 || history[history.length - 1].index !== latestIndex) {
      // The market stamp rides along so the crosshair can age a point in market time:
      // landed runs are not evenly spaced, so position in the array will not do.
      history.push({ index: latestIndex, matrix: latest.corr, marketTs: latest.market_ts ?? null });
      if (history.length > MATRIX_HISTORY_LIMIT) history.shift();
    }
  }

  // Axis order: the selected asset first, on both axes, so the matrix stays symmetric with
  // 1.0 on the diagonal. Only a ROW selection reorders — a cell click highlights the
  // tables but leaves the order alone, so the clicked cell does not jump out from under
  // the pointer (and the reference stays stable, so the pair below is not reset).
  const order =
    selectionSource === "row" && selectedTicker && activeAssets.includes(selectedTicker)
      ? [selectedTicker, ...activeAssets.filter((a) => a !== selectedTicker)]
      : activeAssets;
  const reference = order[0];

  const [pair, setPair] = useState({ a: order[1] ?? reference, b: reference });
  const [cellClicked, setCellClicked] = useState(false);
  useEffect(() => {
    setPair({ a: order[1] ?? reference, b: reference }); // reset when the reference changes
  }, [reference]); // eslint-disable-line react-hooks/exhaustive-deps

  // Outline only once the viewer has interacted — either spotlighted a row or clicked a
  // cell. The pristine state outlines nothing, though the chart below still plots.
  const highlight = selectedTicker != null || cellClicked;

  const matrix = latest?.corr;
  const indexOf = useMemo(
    () => new Map(spotlightAssets.map((asset, i) => [asset, i])),
    [spotlightAssets]
  );
  const at = (name) => indexOf.get(name) ?? -1;
  const series = matrixHistory.current
    .map((entry) => ({ value: entry.matrix[at(pair.a)]?.[at(pair.b)], marketTs: entry.marketTs }))
    .filter((point) => point.value != null);

  // Empty book: nothing to draw. Safe as an early return — every hook above already ran.
  if (order.length === 0) {
    return (
      <Panel title="Correlation Dynamics" note="no positions yet" inert={!riskLive} model>
        <div className="terminal-panel-note">awaiting first fills…</div>
      </Panel>
    );
  }

  return (
    <Panel
      title="Correlation Dynamics"
      note={`reference: ${reference} · click a cell to chart it`}
      inert={!riskLive}
      model
    >
      {/* Both axes scroll; the header row and first column stay pinned so a cell deep in
          a large book is still identifiable. */}
      <div className="corr-scroll">
        <table className="corr-matrix">
          <thead>
            <tr>
              <th className="corr-corner"></th>
              {order.map((asset) => <th key={asset}>{asset}</th>)}
            </tr>
          </thead>
          <tbody>
            {order.map((rowAsset) => (
              <tr key={rowAsset}>
                <th className="corr-rowhead">{rowAsset}</th>
                {order.map((colAsset) => {
                  const value = matrix ? matrix[at(rowAsset)]?.[at(colAsset)] : null;
                  const selected = highlight && pair.a === rowAsset && pair.b === colAsset;
                  return (
                    <td
                      key={colAsset}
                      className={`corr-cell selectable ${selected ? "selected" : ""}`}
                      style={{ background: value == null ? "#cbd5e1" : corrColor(value) }}
                      // Chart the clicked pair AND select the column-axis ticker, so its
                      // row highlights in the positions and decomposition tables.
                      onClick={() => {
                        setPair({ a: rowAsset, b: colAsset });
                        setCellClicked(true);
                        onSelectTicker(colAsset, "cell");
                      }}
                    >
                      {value == null ? "—" : num(value, 2)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <CorrelationChart points={series} pair={pair} />
    </Panel>
  );
}

// PERFORMANCE, mandatory: the snapshot fires on every animation frame, so the desk
// re-renders ~60x a second. At three assets that was free; at 900 matrix cells it would
// choke the main thread. The matrix only changes when a bar LANDS, and `latestIndex`
// already exists for exactly that deduplication. `latest` is deliberately NOT compared —
// it is a new object identity each frame, but its content is pinned by `latestIndex`.
export const CorrelationPanel = memo(CorrelationPanelImpl, (prev, next) =>
  prev.latestIndex === next.latestIndex &&
  prev.riskLive === next.riskLive &&
  prev.selectedTicker === next.selectedTicker &&
  prev.selectionSource === next.selectionSource &&
  prev.spotlightAssets === next.spotlightAssets &&
  prev.activeAssets === next.activeAssets // identity changes only when a name enters the book
);

// Correlation history of the selected pair over landed reassessments.
function CorrelationChart({ points, pair }) {
  const series = points.map((point) => point.value);
  const stamps = points.map((point) => point.marketTs ?? null);
  const [hover, hoverHandlers] = useCrosshair(series.length);
  const label = pair.a === pair.b ? `${pair.a} (self)` : `${pair.a} · ${pair.b}`;
  const current = series.length ? series[series.length - 1] : null;

  const header = (
    <div className="corr-chart-head">
      <span className="corr-chart-pair"><span className="sym">ρ</span> &nbsp;{label}</span>
      <span className="corr-chart-val">{current == null ? "—" : num(current, 3)}</span>
    </div>
  );
  // One point is not a trend, and a placeholder would reserve dead space for a single
  // reading. The current value is already in the header; the plot appears once a second
  // reading can form a line.
  if (series.length < 2) return <div className="corr-chart">{header}</div>;

  const width = 100;
  const height = 32;
  const xs = chartXs(series.length, width);
  // The axis is [0,1]. The lower clamp never fires in practice: across both recorded
  // sessions there are no negative correlations — 30 large-cap Dow names on 5-minute bars
  // all move together. A universe that CAN go negative needs a signed domain here, which
  // is a code change rather than a label.
  const ys = series.map((v) => height - Math.max(0, Math.min(1, v)) * height);

  return (
    <div className="corr-chart">
      {header}
      <div className="chart-hover" {...hoverHandlers}>
        <svg className="corr-chart-svg" viewBox={`0 0 ${width} ${height}`} width="100%" height="72" preserveAspectRatio="none">
          <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke="var(--color-terminal-border)" strokeWidth="0.5" />
          <path d={linePath(xs, ys)} fill="none" stroke="var(--color-terminal-blue)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          {hover != null && (
            <>
              <line className="chart-crosshair" x1={xs[hover]} x2={xs[hover]} y1="0" y2={height} vectorEffect="non-scaling-stroke" />
              <circle cx={xs[hover]} cy={ys[hover]} r="1.4" fill="var(--color-terminal-blue)" />
            </>
          )}
          <circle cx={xs[xs.length - 1]} cy={ys[ys.length - 1]} r="1.6" fill="var(--color-terminal-blue)" />
        </svg>
        {hover != null && (
          <ChartTip xPct={xs[hover]} value={num(series[hover], 3)} age={sampleAge(stamps, hover)} />
        )}
      </div>
      <div className="corr-chart-axis"><span>0.0</span><span>ρ over runs</span><span>1.0</span></div>
    </div>
  );
}
