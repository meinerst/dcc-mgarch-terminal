"use client";
// Is the desk stacked into one column?
//
// The desk's own breakpoint, NOT the shell's. `useIsNarrow` in shell/view.js answers a
// different question at a different width (640px: does the tab bar collapse to two tabs),
// and the desk stacks at 760px because that is where a 240px rail beside 1fr stops leaving
// the content anything. Two independent layout decisions that happen to both be "is this
// narrow" — sharing one number would couple the desk's grid to the nav bar's tab count.
//
// The width below is the ONE place the desk's stacking width is written as a number, and
// the @media blocks at the foot of terminal.css must agree with it: this hook decides which
// PARENT the order tape mounts under, and a stylesheet disagreeing would style a stacked
// desk while the tape sat in the desktop column.
import { useEffect, useState } from "react";

export const STACKED_MAX_WIDTH = 760;

export function useStackedDesk() {
  // Starts false so the first client render matches the prerendered HTML — the static
  // export cannot know the viewport. The truth arrives in the effect below, before paint
  // in practice, and the desk is behind the onboarding gate on a cold load anyway.
  const [stacked, setStacked] = useState(false);

  useEffect(() => {
    const query = window.matchMedia(`(max-width: ${STACKED_MAX_WIDTH}px)`);
    const sync = () => setStacked(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  return stacked;
}
