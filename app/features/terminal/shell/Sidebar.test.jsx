import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Sidebar } from "./Sidebar";

describe("Sidebar", () => {
  const scenarios = [{ id: "calm", subset: { date: "2021-10-14" } }, { id: "crash" }];

  it("prints the session window under the selected scenario only", () => {
    render(
      <Sidebar
        scenario="calm"
        scenarios={scenarios}
        onSelect={() => {}}
        horizon="5 min-ahead"
        subset={{ date: "2021-10-14", session_open: "09:30", session_close: "16:00", tz: "ET" }}
      />
    );

    expect(screen.getByText("Thu 2021-10-14 · 09:30–16:00 ET")).toBeInTheDocument();
  });

  it("switches scenario on click", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <Sidebar scenario="calm" scenarios={scenarios} onSelect={onSelect} horizon="5 min-ahead" subset={null} />
    );

    await user.click(screen.getByText("Crash"));
    expect(onSelect).toHaveBeenCalledWith("crash");
  });

  it("leaves the descriptive entries unclickable", () => {
    render(
      <Sidebar scenario="calm" scenarios={scenarios} onSelect={() => {}} horizon="5 min-ahead" subset={null} />
    );

    expect(screen.getByText("Dow Jones constituents").closest("button")).toBeDisabled();
  });
});
