import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExplainerModal, GateBox, SkeletonDesk } from "./Onboarding";

describe("GateBox", () => {
  const base = { scenario: "calm", onStart: () => {}, onExplain: () => {}, onClose: () => {} };

  it("offers the long form only on a first visit", () => {
    const { rerender } = render(<GateBox {...base} seen={false} />);
    expect(screen.getByRole("button", { name: "EXPLAIN" })).toBeInTheDocument();

    rerender(<GateBox {...base} seen />);
    expect(screen.queryByRole("button", { name: "EXPLAIN" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "▶ START" })).toBeInTheDocument();
  });

  it("names the scenario currently selected, not a fixed one", () => {
    const { rerender } = render(<GateBox {...base} seen />);
    expect(screen.getByText("calm")).toBeInTheDocument();

    rerender(<GateBox {...base} scenario="crash" seen />);
    expect(screen.getByText("crash")).toBeInTheDocument();
  });

  it("starts the run on START and opens the explainer on EXPLAIN", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    const onExplain = vi.fn();
    render(<GateBox {...base} seen={false} onStart={onStart} onExplain={onExplain} />);

    await user.click(screen.getByRole("button", { name: "EXPLAIN" }));
    expect(onExplain).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "▶ START" }));
    expect(onStart).toHaveBeenCalled();
  });

  it("can be dismissed without starting", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onStart = vi.fn();
    render(<GateBox {...base} seen onClose={onClose} onStart={onStart} />);

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
    expect(onStart).not.toHaveBeenCalled();
  });
});

describe("ExplainerModal", () => {
  const base = { scenario: "crash", onAction: () => {}, onClose: () => {} };

  it("keeps the honest-timing claim in the reader's first pass", () => {
    render(<ExplainerModal {...base} action="start" />);

    expect(screen.getByText(/Two clocks, and only one of them is compressed/)).toBeInTheDocument();
    expect(screen.getByText(/A fit that took nine seconds takes nine seconds/)).toBeInTheDocument();
  });

  it("explains every card the desk shows", () => {
    render(<ExplainerModal {...base} action="start" />);

    for (const label of [
      "Gross Exposure · VaR · Expected Shortfall",
      "Portfolio Positions",
      "Correlation Dynamics",
      "Order Flow",
      "Risk Reassessment",
      "VaR Decomposition",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("labels its one action for the place it was opened from", () => {
    const { rerender } = render(<ExplainerModal {...base} action="start" />);
    expect(screen.getByRole("button", { name: "START CRASH" })).toBeInTheDocument();

    rerender(<ExplainerModal {...base} action="resume" />);
    expect(screen.getByRole("button", { name: "RESUME" })).toBeInTheDocument();

    rerender(<ExplainerModal {...base} action="restart" />);
    expect(screen.getByRole("button", { name: "RESTART" })).toBeInTheDocument();
  });

  it("never leaves the reader without a next step", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(<ExplainerModal {...base} action="resume" onAction={onAction} />);

    await user.click(screen.getByRole("button", { name: "RESUME" }));
    expect(onAction).toHaveBeenCalled();
  });
});

describe("SkeletonDesk", () => {
  it("lays out the desk's frame with no run state in it", () => {
    const { container } = render(<SkeletonDesk />);

    expect(container.querySelectorAll(".terminal-panel.skeleton")).toHaveLength(5);
    expect(container.querySelectorAll(".terminal-metric-card.skeleton")).toHaveLength(3);
  });

  // The skeleton's card titles must be the LIVE titles: the frame is what the reader sees
  // first, and a label that changes on START reads as the desk redrawing itself.
  it("titles its cards exactly as the live ones are titled", () => {
    render(<SkeletonDesk />);

    expect(screen.getByText("VaR · 95%")).toBeInTheDocument();
    expect(screen.getByText("Expected Shortfall · 95%")).toBeInTheDocument();
  });
});
