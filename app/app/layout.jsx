import "./styles.css";
import { IBM_Plex_Mono, IBM_Plex_Sans, IBM_Plex_Serif } from "next/font/google";
import { AppShell } from "../shell/AppShell";
import { NARROW_QUERY } from "../shell/breakpoints";

// One superfamily across display, body and data: the mono already carried the tables, so
// serif titles and sans prose from the same design keep the document and the desk reading
// as one piece of work.
//
// Greek coverage (α, β, ν, ρ name the DCC parameters all over the desk) exists ONLY on the
// sans: Google serves no Greek subset for Plex Mono or Plex Serif, and requesting one is a
// build error. Without coverage the browser substitutes a system serif — visibly larger and
// off-family beside the Latin — so the sans carries Greek and the `.sym` class borrows it
// for individual glyphs inside mono and serif runs.
const plexSerif = IBM_Plex_Serif({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-display",
  display: "swap",
});
// Self-hosted, so the static export needs no external font request.
const plexSans = IBM_Plex_Sans({
  subsets: ["latin", "greek"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-sans",
  display: "swap",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

// Resolves a deep link to the desk before first paint. The client's first render must match
// the prerendered HTML, which is always the document, so the shell can only switch to the
// desk in an effect. Without this the document would flash for a frame first.
//
// The second probe is the same trick for viewport width: the tab bar renders its two-tab
// mobile branch from a media query, which the server cannot evaluate, so the first render
// is always the six-tab bar. `data-narrow` lets the stylesheet hide the strip on a phone
// until the effect settles, so the six tabs never flash and reflow down to two.
const VIEW_HINT = `try{if(location.hash==="#terminal"){document.documentElement.dataset.view="terminal"}`
  + `if(matchMedia("${NARROW_QUERY}").matches){document.documentElement.dataset.narrow="1"}}catch(e){}`;

// `metadataBase` is what turns the relative OG image into the absolute URL a crawler
// needs; without it Next warns at build and social cards render blank. `SITE_URL` is an
// env var so a fork's own deployment describes itself rather than this one.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://dccmgarch-terminal.pages.dev";
const TITLE = "DCC-MGARCH · Intraday Risk Terminal";
const DESCRIPTION =
  "Intraday value-at-risk for an equity portfolio: GARCH(1,1)-t marginals, Engle DCC and "
  + "Monte-Carlo VaR on 5-minute bars, computed live on CPU — a 2022 master thesis "
  + "refactored, remeasured under Kupiec and Christoffersen, and rerun through the 2020 crash.";

export const metadata = {
  // The ORIGIN, not SITE_URL: Next already prefixes file-convention images with
  // `basePath`, so a metadataBase carrying the prefix too emits
  // /dcc-mgarch/dcc-mgarch/opengraph-image.png. Verified in the built HTML.
  metadataBase: new URL(new URL(SITE_URL).origin),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: "DCC-MGARCH Terminal",
  authors: [{ name: "Toni Meiners" }],
  keywords: [
    "DCC-MGARCH", "value at risk", "intraday risk", "GARCH", "Engle DCC",
    "Monte Carlo VaR", "Kupiec test", "Christoffersen test", "quantitative finance",
  ],
  // Absolute, not "/": the worker PROXIES modelkit.studio/dcc-mgarch rather than
  // redirecting, so the pages.dev origin stays reachable and serves the same bytes.
  // A relative canonical would resolve against the origin it was fetched from and let
  // the two hostnames compete for the same content.
  alternates: { canonical: SITE_URL },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "DCC-MGARCH Terminal",
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${plexSerif.variable} ${plexSans.variable} ${plexMono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: VIEW_HINT }} />
      </head>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
