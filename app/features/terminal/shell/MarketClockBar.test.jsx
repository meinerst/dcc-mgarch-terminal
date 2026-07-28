import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MarketClockBar } from "./MarketClockBar";

describe("MarketClockBar", () => {
  const base = {
    marketSeconds: 34200,
    replayFactor: 25,
    degraded: false,
    paused: false,
    onTogglePause: () => {},
    done: false,
    onRestart: () => {},
  };

  it("offers START before the run and never a dead end after it", () => {
    const { rerender } = render(<MarketClockBar {...base} started={false} onStart={() => {}} />);
    expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument();

    rerender(<MarketClockBar {...base} started done />);
    expect(screen.getByRole("button", { name: "Restart" })).toBeInTheDocument();
  });

  it("toggles between pause and play while the run is live", async () => {
    const user = userEvent.setup();
    const onTogglePause = vi.fn();
    const { rerender } = render(<MarketClockBar {...base} started onTogglePause={onTogglePause} />);

    await user.click(screen.getByRole("button", { name: "Pause" }));
    expect(onTogglePause).toHaveBeenCalled();

    rerender(<MarketClockBar {...base} started paused onTogglePause={onTogglePause} />);
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
  });

  it("labels the market clock as the only accelerated axis", () => {
    render(<MarketClockBar {...base} started />);

    expect(screen.getByText("MARKET 09:30:00")).toBeInTheDocument();
    expect(screen.getByText("⏩ 25x")).toBeInTheDocument();
  });

  it("keeps the explainer reachable for the whole run", async () => {
    const user = userEvent.setup();
    const onOpenExplainer = vi.fn();
    render(<MarketClockBar {...base} started onOpenExplainer={onOpenExplainer} />);

    await user.click(screen.getByRole("button", { name: "What am I looking at?" }));
    expect(onOpenExplainer).toHaveBeenCalled();
  });
});
