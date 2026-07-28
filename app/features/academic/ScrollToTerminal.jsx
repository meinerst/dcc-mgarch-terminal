"use client";
// Sustained-scroll gateway from the end of the academic page into the live terminal.
//
// The explicit path is the .ac-cta button at the end of Outlook, the page's last section.
// This is a progressive
// enhancement on top of it: once the reader is pinned at the very bottom of the page
// (below the footer — the academic surface scrolls the window) and *keeps* pushing
// downward, a bottom strip fills; at 100% it enters the desk.
//
// The strip is sticky rather than fixed, so at the page bottom it settles above the footer
// instead of on top of it — see the `.scroll-gate` rule in academic.css. It reserves its
// flow space unconditionally, which keeps `document.scrollHeight` (and so `atBottom`)
// constant while the gesture is being measured.
//
// Guards so it never fires by accident (the brief was: only on SUSTAINED intent):
//   - Only counts wheel/touch intent while the window is at its scroll maximum.
//   - Per-event delta is capped (CAP), so a single trackpad flick's momentum cannot
//     complete the bar — it takes ~TARGET/CAP separate downward events.
//   - Any upward scroll, or a pause longer than IDLE_MS, cancels the accumulated intent;
//     the strip then holds its last fill for HOLD_MS and fades out, so it does not blink
//     away the instant scrolling stops.
//   - Fires once (a one-shot guard), then enters.
//   - Disabled entirely under prefers-reduced-motion; the CTA button still works.
//
// Entering means setting the fragment, the same contract the CTA links use. This feature
// knows only the address, never the desk itself.
import { useEffect, useRef, useState } from "react";

const TARGET = 900;   // px of capped, sustained overscroll needed to enter
const CAP = 120;      // max px any single wheel/touch event may contribute
const IDLE_MS = 400;  // pause longer than this and the accumulated intent decays to 0
const HOLD_MS = 900;  // after intent is cancelled, the strip stays visible this long
const AT_BOTTOM_SLOP = 4; // px tolerance for "at the very bottom" (DPR/zoom subpixel)

export default function ScrollToTerminal() {
  const [progress, setProgress] = useState(0); // 0..1, drives the fill
  const [visible, setVisible] = useState(false); // held past progress so it lingers
  const acc = useRef(0);
  const fired = useRef(false);
  const idleTimer = useRef(null);
  const hideTimer = useRef(null);
  const lastTouchY = useRef(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const atBottom = () =>
      window.innerHeight + window.scrollY >=
      document.documentElement.scrollHeight - AT_BOTTOM_SLOP;

    // Cancels the accumulated intent immediately (the anti-accident guard), but leaves
    // the strip on screen at its last fill for HOLD_MS before fading it out.
    const reset = () => {
      if (acc.current === 0) return;
      acc.current = 0;
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => {
        setVisible(false);
        setProgress(0);
      }, HOLD_MS);
    };

    const scheduleIdleReset = () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(reset, IDLE_MS);
    };

    const advance = (rawDelta) => {
      if (fired.current) return;
      if (rawDelta <= 0) { reset(); return; }   // upward intent cancels
      if (!atBottom()) { reset(); return; }     // only counts pinned at the bottom
      if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
      acc.current += Math.min(rawDelta, CAP);
      scheduleIdleReset();
      const p = Math.min(acc.current / TARGET, 1);
      setProgress(p);
      setVisible(true);
      if (p >= 1) {
        fired.current = true;
        if (idleTimer.current) clearTimeout(idleTimer.current);
        window.location.hash = "terminal";
      }
    };

    const onWheel = (e) => advance(e.deltaY);
    const onTouchStart = (e) => { lastTouchY.current = e.touches[0]?.clientY ?? null; };
    const onTouchMove = (e) => {
      const y = e.touches[0]?.clientY;
      if (y == null || lastTouchY.current == null) return;
      const delta = lastTouchY.current - y; // finger up => content scrolls down => positive
      lastTouchY.current = y;
      advance(delta);
    };

    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      if (idleTimer.current) clearTimeout(idleTimer.current);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  return (
    <div
      className={`scroll-gate${visible ? " visible" : ""}`}
      aria-hidden="true"
    >
      <div className="scroll-gate-label">Keep scrolling to enter the terminal</div>
      <div className="scroll-gate-track">
        <div className="scroll-gate-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>
    </div>
  );
}
