/** @type {import('next').NextConfig} */
// Static export for Cloudflare Pages: no origin server, so everything the desk needs
// has to be a fetchable static asset. See docs/ARCHITECTURE.md §4.2.
// Served under a path prefix when it is proxied: modelkit.studio's router forwards
// /dcc-mgarch/* WITHOUT stripping the prefix, so every asset URL this build emits has
// to carry it. Env-driven rather than hardcoded so a bare clone (and the pages.dev
// origin itself) still serves from the root — the deploy build sets it in .env.production.
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig = {
  output: "export",
  basePath: BASE_PATH,
  images: { unoptimized: true },
  trailingSlash: true,
};

module.exports = nextConfig;
