"use client";
// The headline row: how big the book is, and what the model says it can lose.
import { InfoTip } from "../ui/InfoTip";
import { AWAITING_RISK } from "../ui/Panel";
import { Spark } from "../ui/charts";
import { compactMoney, money, num, signedMoney } from "../ui/format";

// Risk per $1,000 of gross exposure — the same VaR and ES, with the book's SIZE divided
// out. The headline dollar figure climbs mostly because the tape keeps filling; this line
// moves only when the model does, which is what makes a shock visible at all. Quoted per
// $1,000 rather than per $1 (a calm reading is $0.0005, unreadable) or as a percent (calm
// collapses to 0.05% for four different values).
//
// The axis is FIXED at a calm book's ceiling and grows in whole multiples, exactly like the
// DCC parameter axes: auto-scaling to each run's own range would blow a quiet wobble up to
// fill the panel. VaR and ES share one axis — ES is always the larger, and on independent
// axes the two lines would trace the same shape and hide the tail premium between them.
const PER_K_BASE = 2;

function perKTop(series) {
  const peak = Math.max(0, ...series);
  return peak <= PER_K_BASE ? PER_K_BASE : Math.ceil(peak / PER_K_BASE) * PER_K_BASE;
}

const perK = (v) => money(v, 2);

// The unit sits UNDER the figure, not beside it: on one line the card had to choose between
// truncating the number and dropping the denominator, which is the one thing this line
// exists to state. "gross" is dropped from the unit itself — the card directly to the left
// is titled GROSS EXPOSURE, both tips spell out "per $1,000 of gross exposure", and the
// shorter unit is what lets the figure and its chart share a narrow card without clipping.
function PerKFigure({ value, fallback, series, stamps, top }) {
  if (value == null) return <span className="metric-perk-fallback">{fallback}</span>;
  return (
    <>
      <span className="metric-perk-figure">
        <span className="metric-perk-value">{perK(value)}</span>
        <span className="metric-perk-unit">per $1k</span>
      </span>
      {/* Back to the full 28px now that the figure occupies two lines beside it. */}
      <Spark series={series} stamps={stamps} top={top} format={perK} />
    </>
  );
}

// The book's two legs, from the two figures the card already carries: a gross of G with a
// net of N is long (G+N)/2 and short (G-N)/2. Exact, not an estimate, and it needs no series
// state — which is why the gross card can carry a visual at all where a sparkline would have
// meant new book state.
//
// Phone-only (CSS): it takes the right-hand column and the `Net:` caption below is hidden,
// because net is the difference this bar already draws. Both render; the breakpoint chooses.
function LongShortSplit({ grossExposure, netExposure }) {
  if (!grossExposure) return null;
  const net = netExposure ?? 0;
  const long = (grossExposure + net) / 2;
  const short = (grossExposure - net) / 2;
  return (
    <div className="gross-split">
      <span>Long {compactMoney(long)}</span>
      <span className="gross-split-bar" aria-hidden="true">
        <span className="gross-split-long" style={{ width: `${(long / grossExposure) * 100}%` }} />
      </span>
      <span>Short {compactMoney(short)}</span>
    </div>
  );
}

export function MetricCards({ grossExposure, netExposure, risk, horizon, riskLive, riskSeries = [] }) {
  const varValue = riskLive ? risk?.var ?? null : null;
  // Expected Shortfall completes the statement VaR only opens: VaR is the tail's
  // threshold, ES the mean loss behind it. Same provenance and same gate as VaR — one
  // Monte-Carlo pass produces both — so they are live or inert together.
  const esValue = riskLive ? risk?.es ?? null : null;
  // ES/VaR is a tail-fatness readout (1.0 = no tail beyond the threshold). It widens
  // exactly where the Student-t tail bites, which is the point of showing ES at all. It
  // lives in the tip now: per-$1k says the same thing on the card face, comparably across
  // sessions, and one number per line survives a narrow card where two do not.
  const esRatio = esValue != null && varValue ? esValue / varValue : null;
  const netSide = netExposure == null ? "" : netExposure >= 0 ? " net long" : " net short";
  // `has-aside` is what turns a card into two columns at phone width. It is set from the
  // CONTENT, not from a viewport query: the awaiting and inert states have no right-hand
  // visual, and would otherwise reserve 40% of an already narrow card for nothing.
  const grossAside = grossExposure ? " has-aside" : "";

  const varSeries = riskSeries.map((point) => point.varPerK);
  const esSeries = riskSeries.map((point) => point.esPerK).filter((v) => v != null);
  const stamps = riskSeries.map((point) => point.marketTs ?? null);
  const top = perKTop([...varSeries, ...esSeries]);
  const latestVarPerK = varSeries.length ? varSeries[varSeries.length - 1] : null;
  const latestEsPerK = esSeries.length ? esSeries[esSeries.length - 1] : null;
  // Two points is `Spark`'s own floor for drawing anything, so it is also the floor for
  // giving the card a second column.
  const varAside = riskLive && varSeries.length >= 2 ? " has-aside" : "";
  const esAside = riskLive && esSeries.length >= 2 ? " has-aside" : "";

  // The horizon is the SAME for every card and never varies, so it is stated in the tips
  // and in the sidebar's model line rather than spending a label line on all three.
  const grossTip =
    "Every position's size added up, shorts included — the capital at risk.\n"
    + `Exactly ${money(grossExposure)} right now.\n`
    + "Net (below) subtracts shorts from longs and names the book's lean.\n"
    + "Longs and shorts both add here: both can lose.";
  const varTip =
    "The most this book should lose in one bar, 19 bars out of 20.\n"
    + "Below it, the same loss per $1,000 of gross exposure: that line\n"
    + "moves when the model does, not when the book grows.\n"
    + `Horizon ${horizon}. 95% quantile of 5,000 Monte-Carlo draws,\n`
    + "latest reassessment, repriced onto the book as it stands now.\n"
    // Stated here rather than on the card face: the dollar figure DOES track the book in
    // real time, so labelling the card "forecast N min ago" read as though the number
    // itself were stale. What is held fixed between fits is the model surface.
    + "Volatility and correlation are held at that fit; only the book's\n"
    + "exposures are current.";
  const esTip =
    "The average loss on the bars that do breach VaR — the tail behind it.\n"
    + "Below it, the same figure per $1,000 of gross exposure.\n"
    + (esRatio != null ? `Currently ${num(esRatio, 2)}x VaR.\n` : "")
    + `Horizon ${horizon}. Same Monte-Carlo pass that produced VaR.`;

  return (
    <div className="terminal-grid-3col" style={{ marginBottom: 16 }}>
      <div className={`terminal-metric-card${grossAside}`}>
        <div className="terminal-metric-label">
          Gross Exposure <InfoTip text={grossTip} />
        </div>
        <div className="terminal-metric-value">{compactMoney(grossExposure)}</div>
        <div className="terminal-metric-sub metric-rule metric-net">
          Net: {signedMoney(netExposure)}{netSide}
        </div>
        <LongShortSplit grossExposure={grossExposure} netExposure={netExposure} />
      </div>
      <div className={`terminal-metric-card model ${riskLive ? "" : "inert"}${varAside}`}>
        <div className="terminal-metric-label">
          VaR · 95% <InfoTip text={varTip} />
        </div>
        <div className="terminal-metric-value negative">{riskLive ? compactMoney(varValue) : "—"}</div>
        <div className="terminal-metric-sub metric-rule metric-perk">
          <PerKFigure
            value={riskLive ? latestVarPerK : null}
            fallback={riskLive ? "Monte-Carlo · 5,000 draws" : AWAITING_RISK}
            series={varSeries}
            stamps={stamps}
            top={top}
          />
        </div>
      </div>
      <div className={`terminal-metric-card model ${riskLive ? "" : "inert"}${esAside}`}>
        <div className="terminal-metric-label">
          Expected Shortfall · 95% <InfoTip text={esTip} />
        </div>
        <div className="terminal-metric-value negative">{riskLive ? compactMoney(esValue) : "—"}</div>
        <div className="terminal-metric-sub metric-rule metric-perk">
          <PerKFigure
            value={riskLive ? latestEsPerK : null}
            fallback={riskLive ? `${num(esRatio, 2)}× VaR, mean of tail` : AWAITING_RISK}
            series={esSeries}
            stamps={stamps}
            top={top}
          />
        </div>
      </div>
    </div>
  );
}
