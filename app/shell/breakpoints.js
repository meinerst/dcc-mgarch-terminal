// Shared layout breakpoints.
//
// Deliberately NOT a "use client" module. The root layout is a server component and inlines
// the narrow width into its pre-paint script; importing that number from a client module
// would hand the server a client-reference proxy instead of the value, and the query would
// be built as "(max-width: [object Object]px)" — silently never matching.

// The width below which the tab bar collapses to two tabs: the section you are in, and the
// terminal. Three consumers must agree on it — the render branch in TabNav.jsx (via
// `useIsNarrow`), the rules in shell.css, and the pre-paint hint in layout.jsx — because
// the bar is a JS branch, and a stylesheet disagreeing with it would style one bar while
// rendering the other. This is the one place it is written as a number.
export const NARROW_MAX_WIDTH = 640;

export const NARROW_QUERY = `(max-width: ${NARROW_MAX_WIDTH}px)`;
