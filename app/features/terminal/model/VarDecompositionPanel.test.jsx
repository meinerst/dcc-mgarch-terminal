import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { positionRow } from "../../../test-utils/fixtures";
import { VarDecompositionPanel } from "./VarDecompositionPanel";

const AWAITING = "AWAITING FIRST RISK SNAPSHOT";

describe("VarDecompositionPanel", () => {
  it("puts the biggest risk contributor on top", () => {
    const { container } = render(
      <VarDecompositionPanel
        rows={[
          positionRow({ ticker: "AAPL", componentVar: 200 }),
          positionRow({ ticker: "JPM", componentVar: 800 }),
        ]}
        riskLive
        selectedTicker={null}
        onSelectTicker={() => {}}
      />
    );

    const first = container.querySelectorAll("tbody tr")[0];
    expect(within(first).getByText("JPM")).toBeInTheDocument();
  });

  it("marks a hedging position rather than hiding its negative contribution", () => {
    const { container } = render(
      <VarDecompositionPanel
        rows={[positionRow({ ticker: "CVX", componentVar: -150 })]}
        riskLive
        selectedTicker={null}
        onSelectTicker={() => {}}
      />
    );

    expect(screen.getByText("-$150")).toBeInTheDocument();
    expect(container.querySelector(".component-var-hedge")).toBeInTheDocument();
  });

  it("goes inert before a fit has landed", () => {
    render(
      <VarDecompositionPanel
        rows={[positionRow()]}
        riskLive={false}
        selectedTicker={null}
        onSelectTicker={() => {}}
      />
    );

    expect(screen.getByText(AWAITING)).toBeInTheDocument();
  });
});
