import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CorrelationPanel } from "./CorrelationPanel";

describe("CorrelationPanel", () => {
  const latest = {
    corr: [
      [1, 0.6, 0.2],
      [0.6, 1, 0.1],
      [0.2, 0.1, 1],
    ],
    market_ts: 300,
  };

  it("waits for the first fill instead of drawing an empty matrix", () => {
    render(
      <CorrelationPanel
        spotlightAssets={["AAPL", "JPM", "CVX"]}
        activeAssets={[]}
        latest={null}
        latestIndex={-1}
        riskLive={false}
        selectedTicker={null}
        selectionSource="row"
        onSelectTicker={() => {}}
      />
    );

    expect(screen.getByText("awaiting first fills…")).toBeInTheDocument();
  });

  it("indexes the matrix by the payload universe while drawing only held names", () => {
    render(
      <CorrelationPanel
        spotlightAssets={["AAPL", "JPM", "CVX"]}
        activeAssets={["JPM", "CVX"]}
        latest={latest}
        latestIndex={0}
        riskLive
        selectedTicker={null}
        selectionSource="row"
        onSelectTicker={() => {}}
      />
    );

    // JPM x CVX is corr[1][2] = 0.1, not corr[0][1].
    expect(screen.getAllByText("0.10")).toHaveLength(2); // symmetric pair
    expect(screen.queryByText("0.60")).not.toBeInTheDocument(); // AAPL is not in the book
  });

  it("selects the column ticker when a cell is clicked", async () => {
    const user = userEvent.setup();
    const onSelectTicker = vi.fn();
    const { container } = render(
      <CorrelationPanel
        spotlightAssets={["AAPL", "JPM", "CVX"]}
        activeAssets={["AAPL", "JPM"]}
        latest={latest}
        latestIndex={0}
        riskLive
        selectedTicker={null}
        selectionSource="row"
        onSelectTicker={onSelectTicker}
      />
    );

    await user.click(container.querySelectorAll(".corr-cell")[1]);
    expect(onSelectTicker).toHaveBeenCalledWith("JPM", "cell");
  });

  it("reorders the axes around a row selection so the reference sits first", () => {
    const { container } = render(
      <CorrelationPanel
        spotlightAssets={["AAPL", "JPM", "CVX"]}
        activeAssets={["AAPL", "JPM"]}
        latest={latest}
        latestIndex={0}
        riskLive
        selectedTicker="JPM"
        selectionSource="row"
        onSelectTicker={() => {}}
      />
    );

    const rowHeads = [...container.querySelectorAll(".corr-rowhead")].map((el) => el.textContent);
    expect(rowHeads).toEqual(["JPM", "AAPL"]);
  });
});
