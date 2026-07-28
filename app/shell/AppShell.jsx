"use client";
// The application shell: chrome, and which feature is on screen.
//
// It composes the two features and owns nothing of their internals. The academic document
// arrives as `children` — server-rendered, so its prose costs no client JavaScript — while
// the desk is loaded on demand, so a visitor who only reads the study never downloads it.
import dynamic from "next/dynamic";
import { Footer } from "./Footer";
import { TabNav } from "./TabNav";
import { TERMINAL_VIEW, useAppView } from "./view";

// Deliberately not server-rendered: the desk is a live client surface with no meaningful
// static markup, and keeping it out of the initial bundle is what preserves the document's
// first-load cost.
const TerminalDesk = dynamic(() => import("../features/terminal"), { ssr: false });

export function AppShell({ children }) {
  const view = useAppView();
  const onTerminal = view === TERMINAL_VIEW;

  return (
    <>
      <TabNav view={view} />
      {onTerminal ? <TerminalDesk /> : children}
      <Footer view={view} />
    </>
  );
}
