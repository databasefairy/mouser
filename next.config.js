/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export only when building for GitHub Pages (see .github/workflows/pages.yml).
  // Default build keeps API routes for Vercel / local.
  ...(process.env.GITHUB_PAGES_BUILD === "true"
    ? { output: "export", trailingSlash: true }
    : {}),
};

module.exports = nextConfig;
