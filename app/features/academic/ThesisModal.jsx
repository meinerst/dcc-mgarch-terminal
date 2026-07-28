"use client";
// Thesis viewer. Self-contained: exports the TRIGGER, which owns the open state and
// renders the modal itself, so the Abstract section stays a server component and the
// only client JS on the academic page besides TabNav is this button.
//
// The PDF is served statically from app/public/thesis.pdf (no origin server; matches
// output: 'export'). Desktop embeds it in an <iframe>; narrow viewports get the download
// pair instead, since iOS Safari does not scroll a PDF inside an iframe.
import { useCallback, useEffect, useRef, useState } from "react";

// The prefix is applied by hand for the same reason as the payload path in
// compute/datasource.js: this is a plain href, not something `basePath` rewrites.
const PDF_HREF = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/thesis.pdf`;
// #view=FitH opens page-width in the browser's built-in viewer; #toolbar keeps its own
// download/print controls available alongside ours.
const PDF_EMBED = `${PDF_HREF}#view=FitH`;
const PDF_FILENAME = "MasterThesis_DCCMGARCH_intraday_risk_tool_Meiners_2022.pdf";
const NARROW_QUERY = "(max-width: 760px)";

export default function ThesisButton() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);

  const close = useCallback(() => {
    setOpen(false);
    // Return focus where the reader left it, not to the top of the document.
    triggerRef.current?.focus();
  }, []);

  // A ruled document line, not a call to action: the whole strip is the control, so the
  // label states what the document IS and the affordance sits at the end of the rule.
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="ac-docline"
        onClick={() => setOpen(true)}
      >
        <span className="ac-docline-label">The original thesis · 2022 · PDF</span>
        <span className="ac-docline-action">Read</span>
      </button>
      {open && <ThesisModal onClose={close} />}
    </>
  );
}

function ThesisModal({ onClose }) {
  const boxRef = useRef(null);
  const [narrow, setNarrow] = useState(false);

  // Embed only where an iframe'd PDF actually works. Evaluated on the client after
  // mount, so the static export carries no assumption either way.
  useEffect(() => {
    const mq = window.matchMedia(NARROW_QUERY);
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // ESC closes; the page behind must not scroll while the overlay is up.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    boxRef.current?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      className="modal-backdrop thesis-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Master's thesis"
      onMouseDown={(e) => {
        // Backdrop click only: a drag that ends outside the box must not close it.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-box thesis-box" ref={boxRef} tabIndex={-1}>
        <div className="thesis-head">
          <div>
            <div className="thesis-eyebrow">Master's thesis · 2022</div>
            <div className="thesis-title">
              Modeling Dynamic Conditional Correlations for Intraday Risk
            </div>
          </div>
          <div className="thesis-head-actions">
            <a className="thesis-download" href={PDF_HREF} download={PDF_FILENAME}>
              Download PDF
            </a>
            <button className="thesis-close" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>
        </div>

        {narrow ? (
          <div className="thesis-fallback">
            <p>
              The document is a 3 MB PDF and does not display reliably in an embedded
              viewer on a small screen. Open it in a new tab or download it.
            </p>
            <a className="thesis-download" href={PDF_HREF} target="_blank" rel="noreferrer">
              Open in a new tab
            </a>
          </div>
        ) : (
          <iframe className="thesis-frame" src={PDF_EMBED} title="Master's thesis (PDF)" />
        )}
      </div>
    </div>
  );
}
