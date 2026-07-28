"use client";
// A permanent redirect for the address the desk used to live at.
//
// The desk moved from its own route to a fragment on the site's single route, so that a
// visitor entering it never leaves the deployment's own path. This route stays because the
// old URL is already published and linked; it is a kept external contract, not leftover
// migration code. A static export cannot answer with an HTTP redirect, so it is done in
// the client and the fragment form is used, which leaves no history entry behind.
import { useEffect } from "react";

export default function TerminalRedirect() {
  useEffect(() => {
    window.location.replace("../#terminal");
  }, []);

  return (
    <main className="redirect-note">
      <p>
        The terminal now lives at <a href="../#terminal">#terminal</a> on the main page.
      </p>
    </main>
  );
}
