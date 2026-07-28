import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { ACADEMIC_VIEW, TERMINAL_HASH, TERMINAL_VIEW, useAppView } from "./view";

function goTo(hash) {
  window.location.hash = hash;
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}

beforeEach(() => {
  window.location.hash = "";
  delete document.documentElement.dataset.view;
});

afterEach(() => {
  window.location.hash = "";
  delete document.documentElement.dataset.view;
});

describe("useAppView", () => {
  it("shows the document when no fragment asks for the desk", () => {
    const { result } = renderHook(() => useAppView());
    expect(result.current).toBe(ACADEMIC_VIEW);
  });

  it("resolves a deep link to the desk", () => {
    window.location.hash = TERMINAL_HASH;
    const { result } = renderHook(() => useAppView());
    expect(result.current).toBe(TERMINAL_VIEW);
  });

  it("starts on the document even for a deep link, so hydration matches the prerender", () => {
    window.location.hash = TERMINAL_HASH;
    let seen;
    renderHook(() => {
      const view = useAppView();
      seen ??= view; // the very first render, before any effect has run
      return view;
    });
    expect(seen).toBe(ACADEMIC_VIEW);
  });

  it("follows the fragment both ways", () => {
    const { result } = renderHook(() => useAppView());

    act(() => goTo(TERMINAL_HASH));
    expect(result.current).toBe(TERMINAL_VIEW);

    act(() => goTo("#abstract"));
    expect(result.current).toBe(ACADEMIC_VIEW);
  });

  it("treats a section fragment as the document, not as an unknown view", () => {
    window.location.hash = "#results";
    const { result } = renderHook(() => useAppView());
    expect(result.current).toBe(ACADEMIC_VIEW);
  });

  it("clears the pre-paint hint once it has decided for itself", () => {
    document.documentElement.dataset.view = "terminal";
    window.location.hash = TERMINAL_HASH;

    renderHook(() => useAppView());

    expect(document.documentElement.dataset.view).toBeUndefined();
  });

  it("stops listening when the shell unmounts", () => {
    const { result, unmount } = renderHook(() => useAppView());
    unmount();

    act(() => goTo(TERMINAL_HASH));
    expect(result.current).toBe(ACADEMIC_VIEW);
  });
});
