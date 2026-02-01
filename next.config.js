const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Use project root for file tracing (avoids parent lockfile / multi-root warnings).
  outputFileTracingRoot: path.join(__dirname),
  // Static export only when building for GitHub Pages (see .github/workflows/pages.yml).
  ...(process.env.GITHUB_PAGES_BUILD === "true"
    ? { output: "export", trailingSlash: true }
    : {}),
};

module.exports = nextConfig;
