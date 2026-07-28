import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MetricCards } from "./MetricCards";

const AWAITING = "AWAITING FIRST RISK SNAPSHOT";

// Two landed fits: $0.50 -> $1.50 of VaR per $1,000 of gross.
const SERIES = [
  { varPerK: 0.5, esPerK: 0.7, marketTs: 300 },
  { varPerK: 1.5, esPerK: 2.1, marketTs: 600 },
];

describe("MetricCards", () => {
  it("stays inert until a fit has priced the book", () => {
    render(
      <MetricCards grossExposure={5000} netExposure={5000} risk={null} horizon="5 min-ahead" riskLive={false} />
    );

    expect(screen.getByText("$5,000")).toBeInTheDocument(); // book arithmetic is always live
    expect(screen.getAllByText(AWAITING)).toHaveLength(2); // VaR and ES are not
  });

  // The headline dollars climb with the book; per-$1k moves only when the model does,
  // which is the whole reason it is on the card.
  it("quotes risk per $1,000 of gross once fits have landed", () => {
    render(
      <MetricCards
        grossExposure={2_000_000}
        netExposure={-2000}
        risk={{ var: 3000, es: 4200 }}
        horizon="5 min-ahead"
        riskLive
        riskSeries={SERIES}
      />
    );

    expect(screen.getByText("$3,000")).toBeInTheDocument();
    expect(screen.getByText("$4,200")).toBeInTheDocument();
    expect(screen.getByText("$1.50")).toBeInTheDocument();
    expect(screen.getByText("$2.10")).toBeInTheDocument();
    expect(screen.getAllByText("per $1k")).toHaveLength(2);
  });

  // A seven-figure book is the ordinary case here, and "$1.38M" spends the reader's one
  // headline figure restating the card's own title. It abbreviates at eight figures now.
  it("states a seven-figure book exactly", () => {
    render(
      <MetricCards grossExposure={1_382_288} netExposure={0} risk={null} horizon="—" riskLive={false} />
    );

    expect(screen.getByText("$1,382,288")).toBeInTheDocument();
  });

  it("abbreviates once the figure is eight digits wide", () => {
    render(
      <MetricCards grossExposure={12_345_678} netExposure={0} risk={null} horizon="—" riskLive={false} />
    );

    expect(screen.getByText("$12.35M")).toBeInTheDocument();
  });

  // Both legs are exact from gross and net alone — no series state behind them. The bar is
  // hidden at desktop width by CSS, so it is always rendered and always assertable.
  it("splits gross into its long and short legs", () => {
    render(
      <MetricCards grossExposure={1_000_000} netExposure={-200_000} risk={null} horizon="—" riskLive={false} />
    );

    expect(screen.getByText("Long $400,000")).toBeInTheDocument();
    expect(screen.getByText("Short $600,000")).toBeInTheDocument();
  });

  // The denominator is the book the fit was PRICED on, supplied by the engine. With no
  // series point there is nothing honest to divide, so the card states its provenance
  // rather than dividing by whatever the book has since become.
  it("falls back to provenance when no per-dollar point exists yet", () => {
    render(
      <MetricCards
        grossExposure={5000}
        netExposure={-2000}
        risk={{ var: 1000, es: 1400 }}
        horizon="5 min-ahead"
        riskLive
      />
    );

    expect(screen.getByText("Monte-Carlo · 5,000 draws")).toBeInTheDocument();
    expect(screen.getByText("1.40× VaR, mean of tail")).toBeInTheDocument();
  });

  it("names the direction of the book's tilt", () => {
    const { rerender } = render(
      <MetricCards grossExposure={5000} netExposure={-2000} risk={null} horizon="—" riskLive={false} />
    );
    expect(screen.getByText(/net short/)).toBeInTheDocument();

    rerender(
      <MetricCards grossExposure={5000} netExposure={2000} risk={null} horizon="—" riskLive={false} />
    );
    expect(screen.getByText(/net long/)).toBeInTheDocument();
  });

  it("gives every card a tip, including the denominator card", () => {
    render(
      <MetricCards
        grossExposure={5000}
        netExposure={2000}
        risk={{ var: 1000, es: 1400 }}
        horizon="5 min-ahead"
        riskLive
        riskSeries={SERIES}
      />
    );

    expect(screen.getAllByText("ⓘ")).toHaveLength(3);
  });
});
