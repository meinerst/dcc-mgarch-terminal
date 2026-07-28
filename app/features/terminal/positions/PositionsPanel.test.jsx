import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { positionRow } from "../../../test-utils/fixtures";
import { PositionsPanel } from "./PositionsPanel";

describe("PositionsPanel", () => {
  const rows = [
    positionRow({ ticker: "AAPL", exposure: 5000, shares: 100 }),
    positionRow({ ticker: "JPM", exposure: -3000, shares: -60 }),
  ];

  it("renders a row per traded name", () => {
    render(<PositionsPanel rows={rows} selectedTicker={null} onSelectTicker={() => {}} />);

    expect(screen.getByText("AAPL")).toBeInTheDocument();
    expect(screen.getByText("+100")).toBeInTheDocument();
    expect(screen.getByText("-60")).toBeInTheDocument();
  });

  it("sorts biggest shorts first by default and reverses on a header click", async () => {
    const user = userEvent.setup();
    render(<PositionsPanel rows={rows} selectedTicker={null} onSelectTicker={() => {}} />);

    const tickerAt = () =>
      screen.getAllByRole("row").slice(1).map((r) => within(r).getAllByRole("cell")[0].textContent);
    expect(tickerAt()).toEqual(["JPM", "AAPL"]);

    await user.click(screen.getByText("EXPOSURE"));
    expect(tickerAt()).toEqual(["AAPL", "JPM"]);
  });

  it("makes a clicked row the correlation reference", async () => {
    const user = userEvent.setup();
    const onSelectTicker = vi.fn();
    render(<PositionsPanel rows={rows} selectedTicker={null} onSelectTicker={onSelectTicker} />);

    await user.click(screen.getByText("AAPL"));
    expect(onSelectTicker).toHaveBeenCalledWith("AAPL");
  });

  it("marks the selected row", () => {
    render(<PositionsPanel rows={rows} selectedTicker="AAPL" onSelectTicker={() => {}} />);

    const selected = screen.getByText("AAPL").closest("tr");
    expect(selected).toHaveClass("selected");
  });

  it("renders an em dash for a price the book does not have yet", () => {
    render(
      <PositionsPanel
        rows={[positionRow({ marketPrice: null, inventoryPrice: null })]}
        selectedTicker={null}
        onSelectTicker={() => {}}
      />
    );

    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });
});
