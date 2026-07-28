import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TabNav } from "./TabNav";
import { NARROW_MAX_WIDTH } from "./breakpoints";
import { ACADEMIC_VIEW, TERMINAL_VIEW } from "./view";

// The bar's narrow branch is driven by a media query and its scroll-spy by element
// geometry, neither of which jsdom provides. Both are stubbed per test: `setViewport`
// decides which bar renders, `placeSections` decides which section the spy elects.

function setViewport(width) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    // Only the narrow query's answer matters here; reduced-motion resolves to false,
    // which is what keeps `scrollIntoView` on its smooth path in these tests.
    matches: query.includes(`${NARROW_MAX_WIDTH}px`) ? width <= NARROW_MAX_WIDTH : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

const SECTION_IDS = ["abstract", "critique", "methodology", "results", "outlook"];

// Mount the five section blocks and put `activeId`'s top above the spy's trigger line,
// with every later section below it — the spy elects the last one that has crossed.
function placeSections(activeId) {
  document.body.innerHTML = SECTION_IDS.map((id) => `<div id="${id}"></div>`).join("");
  const activeIndex = SECTION_IDS.indexOf(activeId);
  SECTION_IDS.forEach((id, index) => {
    const element = document.getElementById(id);
    element.getBoundingClientRect = () => ({ top: index <= activeIndex ? -10 : 500 });
    element.scrollIntoView = vi.fn();
  });
}

beforeEach(() => {
  window.location.hash = "";
  setViewport(375);
  placeSections("abstract");
  window.IntersectionObserver = class {
    observe() {}
    disconnect() {}
  };
});

afterEach(() => {
  window.location.hash = "";
  document.body.innerHTML = "";
});

function sectionTab() {
  return document.querySelector(".tabnav-tab--section");
}

describe("TabNav, narrow bar", () => {
  it("shows two tabs: the section in view, and the terminal", async () => {
    placeSections("critique");
    render(<TabNav view={ACADEMIC_VIEW} />);

    // The spy elects its section in a rAF, so the label settles after first paint.
    await waitFor(() => expect(sectionTab()).toHaveTextContent("Critique"));
    expect(screen.getByText("Terminal")).toBeInTheDocument();
    // The other four sections are not tabs. They exist only as sheet rows — the sheet
    // stays mounted and is hidden by visibility, since a closed display:none could not
    // animate open.
    expect(document.querySelectorAll(".tabnav-tab")).toHaveLength(2);
    expect(screen.getByText("Methodology")).toHaveClass("tabnav-sheet-row");
  });

  it("keeps all five section tabs on a wide viewport", () => {
    setViewport(1200);
    render(<TabNav view={ACADEMIC_VIEW} />);

    for (const label of ["Abstract", "Critique", "Methodology", "Results", "Outlook"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(sectionTab()).toBeNull();
  });

  it("opens the sheet from the section tab and closes it again", async () => {
    const user = userEvent.setup();
    render(<TabNav view={ACADEMIC_VIEW} />);

    expect(sectionTab()).toHaveAttribute("aria-expanded", "false");

    await user.click(sectionTab());
    expect(sectionTab()).toHaveAttribute("aria-expanded", "true");
    expect(document.querySelector(".tabnav-sheet")).toHaveClass("open");

    await user.click(document.querySelector(".tabnav-scrim"));
    expect(sectionTab()).toHaveAttribute("aria-expanded", "false");
  });

  it("scrolls to the picked section and closes the sheet", async () => {
    const user = userEvent.setup();
    render(<TabNav view={ACADEMIC_VIEW} />);

    await user.click(sectionTab());
    await user.click(screen.getByRole("menuitem", { name: "Outlook" }));

    expect(document.getElementById("outlook").scrollIntoView).toHaveBeenCalled();
    expect(document.querySelector(".tabnav-sheet")).not.toHaveClass("open");
  });

  it("labels the left tab 'Academic' on the desk, with no sheet", () => {
    window.location.hash = "#terminal";
    render(<TabNav view={TERMINAL_VIEW} />);

    expect(sectionTab()).toHaveTextContent("Academic");
    expect(document.querySelector(".tabnav-sheet")).toBeNull();
  });

  it("returns from the desk to the section that was being read", async () => {
    placeSections("results");
    const { rerender } = render(<TabNav view={ACADEMIC_VIEW} />);
    await waitFor(() => expect(sectionTab()).toHaveTextContent("Results"));

    rerender(<TabNav view={TERMINAL_VIEW} />);
    expect(sectionTab()).toHaveAttribute("href", "#results");
  });
});
