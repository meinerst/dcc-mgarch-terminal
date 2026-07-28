import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { installRaf } from "../../test-utils/raf";

// Mocked at the module boundary, which is exactly the seam the desk is built around: the
// data source is the ONLY thing that differs between a recording and a live CPU run, so
// stubbing it exercises the real engine, the real book and the real panels.
vi.mock("./compute/datasource", () => ({
  isLiveMode: false,
  loadManifest: vi.fn(),
  loadScenario: vi.fn(),
  loadLiveSession: vi.fn(),
  loadLiveBar: vi.fn(),
}));

import { loadManifest, loadScenario } from "./compute/datasource";
import { TerminalDesk } from "./TerminalDesk";

// Round numbers over the real ones: 100x replay on 100-second bars puts one bar at one
// real second, so the whole session plays out inside a couple of stepped frames.
const PAYLOAD = {
  scenario: "calm",
  spotlight_assets: ["AAPL", "JPM", "CVX"],
  replay_factor: 100,
  sec_per_bar: 100,
  min_names_for_risk: 1,
  session: { date: "2021-10-14", open: "09:30", close: "16:00", tz: "ET" },
  subset: { date: "2021-10-14", session_open: "09:30", session_close: "16:00", tz: "ET" },
  cpu: "Test CPU",
  events: [
    { type: "order", market_ts: 50, asset: "AAPL", side: "buy", shares: 100, fillPrice: 50 },
    {
      type: "reassess", market_ts: 100, compute_seconds: 0.2,
      var: 1000, es: 1400, converged: true, degraded: false, held_names: 1,
      dcc: { a: 0.03, b: 0.95, nu: 7 },
      corr_spotlight: [[1]],
      corr: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
      marketPrices: { AAPL: 50, JPM: 30, CVX: 80 },
      sigma_forecast: [0.01, 0.01, 0.01],
    },
  ],
};

let raf;

beforeEach(() => {
  raf = installRaf();
  sessionStorage.clear();
  loadManifest.mockResolvedValue({ scenarios: [{ id: "calm" }, { id: "crash" }] });
  loadScenario.mockImplementation(async () => structuredClone(PAYLOAD));
});

afterEach(() => raf.restore());

// The engines push state from inside a rAF callback, so every stepped frame is a React
// update and has to be flushed like one.
async function play(seconds) {
  await act(async () => { await raf.advance(seconds); });
}

describe("TerminalDesk", () => {
  it("plays the critical path: cold gate, start, panels, restart", async () => {
    const user = userEvent.setup();
    const { container } = render(<TerminalDesk />);

    // --- cold: the gate is up and NOTHING has been fetched -------------------------
    expect(screen.getByRole("button", { name: "▶ START" })).toBeInTheDocument();
    expect(container.querySelectorAll(".terminal-panel.skeleton").length).toBeGreaterThan(0);
    await waitFor(() => expect(loadManifest).toHaveBeenCalled()); // the rail's labels only
    expect(loadScenario).not.toHaveBeenCalled();

    // --- START: the payload is pulled and the run begins ---------------------------
    await user.click(screen.getByRole("button", { name: "▶ START" }));
    await waitFor(() => expect(loadScenario).toHaveBeenCalledWith("calm"));
    expect(screen.queryByRole("button", { name: "▶ START" })).not.toBeInTheDocument();

    // --- the panels render the snapshot, not the skeleton --------------------------
    await play(0.8); // past the order at market_ts 50
    expect(container.querySelectorAll(".terminal-panel.skeleton")).toHaveLength(0);
    // 100 AAPL at 50: the headline card and the positions row, both pure book arithmetic.
    expect(screen.getAllByText("$5,000")).toHaveLength(2);
    const tape = [...container.querySelectorAll(".order-row")];
    expect(tape).toHaveLength(1);
    expect(tape[0].textContent).toContain("AAPL");

    await play(1.2); // past the fit at market_ts 100
    // The headline VaR, and the same figure again as the lone name's Euler component.
    expect(screen.getAllByText("$1,000")).toHaveLength(2);
    expect(screen.getByText("$1,400")).toBeInTheDocument(); // ES

    // --- the session plays out and offers a way back in ----------------------------
    await play(4);
    const restart = await screen.findByRole("button", { name: "RESTART" });

    loadScenario.mockClear();
    await user.click(restart);
    await waitFor(() => expect(loadScenario).toHaveBeenCalledWith("calm"));
    expect(screen.queryByText("SESSION COMPLETE")).not.toBeInTheDocument();
  });

  it("fetches nothing at all for a reader who dismisses the gate", async () => {
    const user = userEvent.setup();
    render(<TerminalDesk />);

    await user.click(screen.getByRole("button", { name: "Close" }));
    await play(2);

    expect(loadScenario).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("switches scenario without a second start button", async () => {
    const user = userEvent.setup();
    render(<TerminalDesk />);

    await user.click(screen.getByRole("button", { name: "▶ START" }));
    await waitFor(() => expect(loadScenario).toHaveBeenCalledWith("calm"));

    await user.click(screen.getByText("Crash"));
    await waitFor(() => expect(loadScenario).toHaveBeenCalledWith("crash"));
    expect(screen.queryByRole("button", { name: "▶ START" })).not.toBeInTheDocument();
  });

  it("reports a failed load instead of sitting on an empty frame", async () => {
    const user = userEvent.setup();
    loadScenario.mockRejectedValue(new Error("payload 404"));
    render(<TerminalDesk />);

    await user.click(screen.getByRole("button", { name: "▶ START" }));

    expect(await screen.findByText(/Failed to load scenario: payload 404/)).toBeInTheDocument();
  });
});
