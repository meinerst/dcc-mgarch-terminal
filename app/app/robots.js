// Emitted as a static /robots.txt by `output: 'export'`. Everything here is public by
// design — the private tree never reaches the bundle — so the only rule is where the
// sitemap lives.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://dccmgarch-terminal.pages.dev";

export const dynamic = "force-static";

export default function robots() {
  return {
    rules: [{ userAgent: "*", allow: "/" }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
