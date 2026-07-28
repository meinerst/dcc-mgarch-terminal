import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ComputeClockPanel } from "./ComputeClockPanel";

const IDLE_COMPUTE = {
  running: false, idle: true, landed: false, done: false, dead: false,
  elapsed: 0, target: 9, progress: 0, waitSeconds: 4,
};

describe("ComputeClockPanel", () => {
  const props = {
    compute: IDLE_COMPUTE,
    history: [],
    dccSeries: [],
    latest: null,
    riskLive: false,
    cpu: "Ryzen 7 5700X",
    minNamesForRisk: 3,
  };

  it("waits between bars without claiming to compute", () => {
    render(<ComputeClockPanel {...props} />);

    expect(screen.getByText("waiting for next bar")).toBeInTheDocument();
    expect(screen.getByText("no completed runs yet")).toBeInTheDocument();
    expect(screen.getByText("awaiting first run")).toBeInTheDocument();
  });

  it("reports an overrunning fit as over estimate rather than counting past zero", () => {
    render(
      <ComputeClockPanel
        {...props}
        compute={{ ...IDLE_COMPUTE, idle: false, running: true, elapsed: 12, target: 9, progress: 0.97 }}
      />
    );

    expect(screen.getByText("computing…")).toBeInTheDocument();
    expect(screen.getByText(/3\.0s over estimate/)).toBeInTheDocument();
  });

  it("explains a dead bar in terms of the book, not the model", () => {
    render(<ComputeClockPanel {...props} compute={{ ...IDLE_COMPUTE, idle: false, dead: true }} />);

    expect(screen.getByText("book < 3 securities — no fit run")).toBeInTheDocument();
  });

  it("summarises the latency of the runs it plots", () => {
    const { container } = render(
      <ComputeClockPanel
        {...props}
        // newest-first, as the desk hands it over
        history={[
          { index: 2, marketTs: 600, kind: "computed", seconds: 4 },
          { index: 1, marketTs: 300, kind: "computed", seconds: 8 },
          { index: 0, marketTs: 0, kind: "computed", seconds: 12 },
        ]}
      />
    );

    const stats = [...container.querySelectorAll(".run-spark-stats dd")].map((el) => el.textContent);
    expect(stats).toEqual(["4.0s", "8.0s", "12.0s"]); // last, median, slowest
    expect(container.querySelectorAll(".run-spark-col")).toHaveLength(3);
  });

  it("plots dead bars as present-but-untimed rather than dropping them", () => {
    const { container } = render(
      <ComputeClockPanel
        {...props}
        history={[
          { index: 1, marketTs: 300, kind: "computed", seconds: 8 },
          { index: 0, marketTs: 0, kind: "dead", seconds: null },
        ]}
      />
    );

    const kinds = [...container.querySelectorAll(".run-spark-col")].map((el) => el.className);
    expect(kinds[0]).toContain("kind-dead"); // oldest first, left to right
    expect(kinds[1]).toContain("kind-computed");
  });

  it("names the machine the wall-time was measured on", () => {
    render(<ComputeClockPanel {...props} />);
    expect(screen.getByText("Ryzen 7 5700X · 1 thread")).toBeInTheDocument();
  });

  it("shows the fitted parameters only once a fit has landed", () => {
    render(
      <ComputeClockPanel
        {...props}
        riskLive
        latest={{ dcc: { a: 0.0312, b: 0.9511, nu: 7.25 }, degraded: false }}
      />
    );

    expect(screen.getByText("0.0312")).toBeInTheDocument();
    expect(screen.getByText("converged")).toBeInTheDocument();
  });

  it("says so when the constant-correlation fallback fired", () => {
    render(<ComputeClockPanel {...props} riskLive latest={{ dcc: null, degraded: true }} />);

    expect(screen.getByText(/constant-correlation fallback/)).toBeInTheDocument();
  });
});
