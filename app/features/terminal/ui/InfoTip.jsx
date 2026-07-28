"use client";
// The ⓘ note used by every tipped header, panel title and stat on the desk.
//
// How to write one: meaning first, derivation last, one line per `\n`. The desk's tips had
// all drifted the other way — opening with the computation ("Exposure-weighted mean of the
// marginal Student-t degrees of freedom", "1 minus this position's correlation") and
// burying what the number means in the final clause, often behind a sentence denying what
// the reader might have assumed. In a 240px box that is eight wrapped lines before the
// payload. A reader who wants the maths will read to the end; one who wants to read the
// column cannot.
//
// The tip is `position: fixed`, NOT absolute inside its trigger. Every table on the desk
// lives in `.table-scroll` (overflow-x auto, plus overflow-y when tall), and an absolutely
// positioned tip is clipped by that scroll box — a header tip came out sliced on both
// edges. A fixed element is laid out against the viewport, so no ancestor's overflow can
// cut it, and the same component works in a scrolling table, a panel header and a 96px
// grid cell without per-site anchoring overrides.
//
// Coordinates are measured off the ⓘ on open and clamped to the viewport, flipping above
// the trigger when there is no room below.
import { useCallback, useRef, useState } from "react";

const WIDTH = 240;  // matches .th-tooltip's max width; the clamp needs it as a number
const GAP = 8;      // breathing room from the trigger and from the viewport edges

export function InfoTip({ text }) {
  const triggerRef = useRef(null);
  const [pos, setPos] = useState(null);

  const open = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(WIDTH, window.innerWidth - 2 * GAP);
    // Centre on the ⓘ, then clamp so neither edge leaves the viewport.
    const left = Math.min(
      Math.max(GAP, rect.left + rect.width / 2 - width / 2),
      window.innerWidth - width - GAP,
    );
    // Below by default; above when the lower half of the viewport is the tighter side.
    const below = rect.bottom + GAP;
    const flip = below > window.innerHeight / 2 && rect.top > window.innerHeight - rect.bottom;
    setPos(flip
      ? { left, bottom: window.innerHeight - rect.top + GAP, width }
      : { left, top: below, width });
  }, []);

  const close = useCallback(() => setPos(null), []);

  return (
    <span
      ref={triggerRef}
      className="th-info"
      // The ⓘ sits inside a sortable <th> and a selectable row; a click on it must not
      // also re-sort the column or select the row underneath.
      onClick={(e) => e.stopPropagation()}
      onMouseEnter={open}
      onMouseLeave={close}
      // Touch has no hover: a tap opens, a tap elsewhere (blur) closes.
      onFocus={open}
      onBlur={close}
      tabIndex={0}
    >
      ⓘ
      {pos && (
        // A tip is written as short lines, not one paragraph: at 240px a run-on note is
        // eight wrapped lines with nothing to anchor on. `\n` in the text is a real break.
        <span className="th-tooltip" style={pos}>
          {text.split("\n").map((line) => <span key={line} className="th-tooltip-line">{line}</span>)}
        </span>
      )}
    </span>
  );
}
