import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Auto-cleanup is only wired when Vitest runs with globals; this suite does not.
afterEach(cleanup);

// jsdom implements no `matchMedia`, and the desk asks for one on mount (`useStackedDesk`),
// so without this every TerminalDesk test dies in an effect rather than on an assertion —
// which is exactly how four of them were failing silently against a green-looking suite.
// Non-matching by default: the suite asserts the desktop layout, and a test wanting the
// stacked branch overrides this per case.
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  });
}
