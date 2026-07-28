"use client";
// Which surface the application is showing, derived from the URL fragment.
//
// The study and the terminal live at ONE address. The fragment is the contract between
// them: `#terminal` shows the desk, anything else shows the document. Nothing links
// directly between the two features — the academic side just points at `#terminal`, and
// this decides what that means — so neither feature imports the other.
//
// A fragment rather than a route because the whole site is one static export mounted at a
// path that may move; a link that only ever changes the fragment can never navigate out of
// its own deployment.
import { useEffect, useState } from "react";
import { NARROW_QUERY } from "./breakpoints";

export const TERMINAL_HASH = "#terminal";

export const ACADEMIC_VIEW = "academic";
export const TERMINAL_VIEW = "terminal";

// True on a narrow viewport. Like `useAppView`, the server cannot know the answer, so the
// first render is always the wide bar and the truth arrives in an effect; the pre-paint
// `data-narrow` hint in layout.jsx hides the strip until then, so the swap is not seen.
export function useIsNarrow() {
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    const query = window.matchMedia(NARROW_QUERY);
    const sync = () => setNarrow(query.matches);
    sync();
    delete document.documentElement.dataset.narrow; // the pre-paint hint has done its job
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  return narrow;
}

function viewFromHash() {
  if (typeof window === "undefined") return ACADEMIC_VIEW;
  return window.location.hash === TERMINAL_HASH ? TERMINAL_VIEW : ACADEMIC_VIEW;
}

export function useAppView() {
  // Always starts on the document so the client's first render matches the prerendered
  // HTML. A deep link to the desk is resolved in the effect below; the inline script in
  // the layout hides the document before paint so that swap is not visible.
  const [view, setView] = useState(ACADEMIC_VIEW);

  useEffect(() => {
    const sync = () => setView(viewFromHash());
    sync();
    delete document.documentElement.dataset.view; // the pre-paint hint has done its job
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  return view;
}
