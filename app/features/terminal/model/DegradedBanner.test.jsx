import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DegradedBanner } from "./DegradedBanner";

describe("DegradedBanner", () => {
  it("states which way the risk number is wrong", () => {
    render(<DegradedBanner />);
    expect(screen.getByText(/Tail risk is understated/)).toBeInTheDocument();
  });
});
