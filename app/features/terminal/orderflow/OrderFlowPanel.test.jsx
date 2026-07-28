import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { OrderFlowPanel } from "./OrderFlowPanel";

describe("OrderFlowPanel", () => {
  it("says it is waiting rather than showing an empty frame", () => {
    render(<OrderFlowPanel ticker={[]} />);
    expect(screen.getByText("awaiting orders…")).toBeInTheDocument();
  });

  it("puts the newest order at the bottom of the tape", () => {
    const feed = [
      { market_ts: 200, clock: 34400, asset: "JPM", shares: -50, fillPrice: 30 },
      { market_ts: 100, clock: 34300, asset: "AAPL", shares: 100, fillPrice: 50 },
    ]; // engine hands the feed newest-first

    const { container } = render(<OrderFlowPanel ticker={feed} />);
    const rows = [...container.querySelectorAll(".order-row")];
    expect(rows[0].textContent).toContain("AAPL");
    expect(rows[1].textContent).toContain("JPM");
  });

  it("labels the side from the sign of the fill", () => {
    render(
      <OrderFlowPanel
        ticker={[{ market_ts: 100, clock: 34300, asset: "AAPL", shares: -100, fillPrice: 50 }]}
      />
    );

    expect(screen.getByText(/SELL/)).toBeInTheDocument();
  });
});
