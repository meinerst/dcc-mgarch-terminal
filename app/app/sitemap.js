// Two URLs, because that is how many the site has: the study at `/`, and `/terminal`,
// the kept external contract that redirects into the desk. The desk itself is a fragment
// (`/#terminal`) and fragments are not separate URLs to a crawler.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://dccmgarch-terminal.pages.dev";

export const dynamic = "force-static";

export default function sitemap() {
  return [
    { url: `${SITE_URL}/`, changeFrequency: "monthly", priority: 1 },
    // Trailing slash because `trailingSlash: true` is the shape the export actually
    // serves; without it the listed URL is a redirect rather than the document.
    { url: `${SITE_URL}/terminal/`, changeFrequency: "monthly", priority: 0.8 },
  ];
}
