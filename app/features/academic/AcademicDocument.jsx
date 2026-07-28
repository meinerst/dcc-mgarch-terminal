// The written study, as one scrollable document.
//
// Every section is a plain server component, so the first paint carries all of the prose
// and none of it costs client JavaScript. Only the tab bar's scroll-spy and the scroll
// gateway below are interactive.
import AbstractSection from "./sections/AbstractSection";
import CritiqueSection from "./sections/CritiqueSection";
import MethodologySection from "./sections/MethodologySection";
import ResultsSection from "./sections/ResultsSection";
import OutlookSection from "./sections/OutlookSection";
import ScrollToTerminal from "./ScrollToTerminal";

export function AcademicDocument() {
  return (
    <main className="academic">
      <div className="academic-inner">
        <AbstractSection />
        {/* The critique comes BEFORE the methodology: a reader should learn why the model
            needed changing before meeting its specification. It reports no results, so
            Results states every measured figure exactly once. */}
        <CritiqueSection />
        <MethodologySection />
        <ResultsSection />
        <OutlookSection />
      </div>
      {/* Sustained-scroll gateway into the terminal. Progressive enhancement on top of the
          explicit call to action. It is sticky to the viewport bottom, so it must stay the
          LAST child of this main: that placement is what makes it settle above the global
          footer — main's sibling — rather than over it, once the page is scrolled out. */}
      <ScrollToTerminal />
    </main>
  );
}
