"use client";
// The persistent tab bar, in two modes.
//
//   On the document  the tabs are in-page scroll controls over the section blocks. A
//                    scroll-spy drives the active tab and a gliding underline; clicks
//                    smooth-scroll and update the fragment, so deep links work.
//   On the terminal  the bar morphs dark and the tabs become plain fragment links back to
//                    the document's sections; the underline is hidden.
//
// ...and in two widths. Five section tabs plus the terminal cannot fit a phone, so below
// `NARROW_MAX_WIDTH` the bar renders two tabs instead: the section you are currently in,
// and the terminal. The left tab carries a caret and opens a sheet listing all five
// sections, which is how section navigation survives at that width. Both widths share one
// scroll-spy, one underline and one fragment contract — only the tabs differ.
//
// Nothing here imports either feature: the bar only ever sets the fragment, and the shell
// decides what that shows.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { TERMINAL_HASH, TERMINAL_VIEW, useIsNarrow } from "./view";

const SECTIONS = [
  { id: "abstract", label: "Abstract" },
  { id: "critique", label: "Critique" },
  { id: "methodology", label: "Methodology" },
  { id: "results", label: "Results" },
  { id: "outlook", label: "Outlook" },
];

const SECTION_IDS = new Set(SECTIONS.map((s) => s.id));

// The sticky bar's height; the scroll-spy's trigger line sits just below it.
function tabbarHeight() {
  if (typeof window === "undefined") return 46;
  const value = getComputedStyle(document.documentElement).getPropertyValue("--tabbar-h");
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 46;
}

function prefersReducedMotion() {
  return typeof window !== "undefined"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function TabNav({ view }) {
  const onTerminal = view === TERMINAL_VIEW;
  const onAcademic = !onTerminal;
  const narrow = useIsNarrow();

  const [activeId, setActiveId] = useState("abstract");
  const [underline, setUnderline] = useState({ left: 0, width: 0, visible: false });
  const [sheetOpen, setSheetOpen] = useState(false);
  const tabsRef = useRef(null);
  const tabElements = useRef({}); // id -> anchor, for measuring the underline

  // Where to land when the narrow bar's left tab brings a reader back from the desk. The
  // fragment cannot answer this: entering the terminal overwrites it with `#terminal`, so
  // the last section the spy saw is stashed here while it is still known.
  const lastSectionId = useRef("abstract");
  useEffect(() => {
    if (onAcademic) lastSectionId.current = activeId;
  }, [onAcademic, activeId]);

  const setTabElement = (id) => (element) => {
    if (element) tabElements.current[id] = element;
    else delete tabElements.current[id];
  };

  // Which section owns the viewport: the last one whose top has crossed the trigger line.
  // Deterministic, so the active tab never flickers between two candidates.
  const computeActive = useCallback(() => {
    const trigger = tabbarHeight() + 12;
    let current = SECTIONS[0].id;
    for (const section of SECTIONS) {
      const element = document.getElementById(section.id);
      if (element && element.getBoundingClientRect().top - trigger <= 0) current = section.id;
    }
    return current;
  }, []);

  // Coming back from the terminal to a section link, the document has only just mounted,
  // so the browser will not act on the fragment itself. Scroll to it once.
  useEffect(() => {
    if (!onAcademic) return;
    const target = window.location.hash.replace(/^#/, "");
    if (!SECTION_IDS.has(target)) return;
    document.getElementById(target)?.scrollIntoView({ behavior: "auto", block: "start" });
  }, [onAcademic]);

  // Scroll-spy, document only. An IntersectionObserver wakes the recompute as sections
  // cross the top band and a rect scan decides the winner. The fragment is kept in sync
  // with replaceState so deep links work without adding history entries.
  useEffect(() => {
    if (!onAcademic) return;
    let frame = 0;
    const sync = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const id = computeActive();
        setActiveId(id);
        const hash = `#${id}`;
        if (typeof history !== "undefined" && window.location.hash !== hash) {
          history.replaceState(null, "", hash);
        }
      });
    };

    const elements = SECTIONS.map((s) => document.getElementById(s.id)).filter(Boolean);
    const observer = new IntersectionObserver(sync, {
      rootMargin: `-${tabbarHeight()}px 0px -65% 0px`,
      threshold: [0, 1],
    });
    elements.forEach((element) => observer.observe(element));
    window.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync);

    // Honour a deep link on first paint, else settle on the top section.
    const initial = window.location.hash.replace(/^#/, "");
    if (SECTION_IDS.has(initial)) setActiveId(initial);
    else sync();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
    };
  }, [onAcademic, computeActive]);

  // The gliding underline slides and resizes to the active tab's box. Hidden on the
  // terminal, where the tabs are plain links.
  useLayoutEffect(() => {
    if (!onAcademic) {
      setUnderline((u) => (u.visible ? { ...u, visible: false } : u));
      return;
    }
    const place = () => {
      const element = tabElements.current[activeId];
      if (!element || !tabsRef.current) return;
      setUnderline({ left: element.offsetLeft, width: element.offsetWidth, visible: true });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [activeId, onAcademic]);

  // The sheet is a phone-only, document-only affordance: it cannot outlive a switch to the
  // desk or a resize back to the wide bar, either of which unmounts the tab that owns it.
  useEffect(() => {
    if (onTerminal || !narrow) setSheetOpen(false);
  }, [onTerminal, narrow]);

  // Escape closes it, as any transient overlay should.
  useEffect(() => {
    if (!sheetOpen) return;
    const onKeyDown = (event) => {
      if (event.key === "Escape") setSheetOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [sheetOpen]);

  function onSectionClick(event, id) {
    event.preventDefault();
    setSheetOpen(false);
    const element = document.getElementById(id);
    if (!element) return;
    element.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
    if (typeof history !== "undefined") history.replaceState(null, "", `#${id}`);
    setActiveId(id);
  }

  // The wide bar: one tab per section, plus the terminal.
  const wideTabs = SECTIONS.map((section) => {
    const active = onAcademic && activeId === section.id;
    // On the document these scroll in place; on the terminal they are plain links
    // that switch back to the document at that section.
    return onAcademic ? (
      <a
        key={section.id}
        ref={setTabElement(section.id)}
        href={`#${section.id}`}
        className={`tabnav-tab${active ? " active" : ""}`}
        onClick={(event) => onSectionClick(event, section.id)}
      >
        {section.label}
      </a>
    ) : (
      <a key={section.id} href={`#${section.id}`} className="tabnav-tab">
        {section.label}
      </a>
    );
  });

  // The narrow bar: a single left tab standing in for all five sections. On the document
  // it names the section you are in and opens the sheet; on the desk it is the way back,
  // to the section you were reading when you left.
  const activeSection = SECTIONS.find((section) => section.id === activeId) ?? SECTIONS[0];
  const narrowTab = onAcademic ? (
    <button
      type="button"
      ref={setTabElement(activeId)}
      className={`tabnav-tab tabnav-tab--section active${sheetOpen ? " open" : ""}`}
      aria-expanded={sheetOpen}
      aria-haspopup="menu"
      onClick={() => setSheetOpen((open) => !open)}
    >
      {/* Keyed so the label crossfades on its own as the spy moves between sections. */}
      <span key={activeSection.id} className="tabnav-tab-label">{activeSection.label}</span>
      <span className="tabnav-caret" aria-hidden="true" />
    </button>
  ) : (
    <a href={`#${lastSectionId.current}`} className="tabnav-tab tabnav-tab--section">
      <span className="tabnav-tab-label">Academic</span>
    </a>
  );

  return (
    <header className={`tabnav${onTerminal ? " tabnav--terminal" : ""}`}>
      <a href="#abstract" className="tabnav-brand">DCC-MGARCH</a>
      <nav className="tabnav-tabs" ref={tabsRef}>
        {narrow ? narrowTab : wideTabs}
        <a
          href={TERMINAL_HASH}
          className={`tabnav-tab${onTerminal ? " active" : ""}${!onTerminal ? " has-badge" : ""}`}
        >
          Terminal
          {/* The badge advertises the desk from the document; once on it, it is redundant. */}
          {!onTerminal && <span className="tabnav-badge">DEMO</span>}
        </a>
        {onAcademic && (
          <span
            className="tabnav-underline"
            style={{
              transform: `translateX(${underline.left}px)`,
              width: underline.width,
              opacity: underline.visible ? 1 : 0,
            }}
          />
        )}
      </nav>
      {narrow && onAcademic && (
        <>
          {/* Backdrop first, so a tap anywhere off the sheet closes it. */}
          <div
            className={`tabnav-scrim${sheetOpen ? " open" : ""}`}
            onClick={() => setSheetOpen(false)}
          />
          <div className={`tabnav-sheet${sheetOpen ? " open" : ""}`} role="menu">
            {SECTIONS.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                role="menuitem"
                className={`tabnav-sheet-row${section.id === activeId ? " active" : ""}`}
                tabIndex={sheetOpen ? 0 : -1}
                onClick={(event) => onSectionClick(event, section.id)}
              >
                {section.label}
              </a>
            ))}
          </div>
        </>
      )}
    </header>
  );
}
