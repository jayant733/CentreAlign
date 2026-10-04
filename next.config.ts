import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Playwright and pdfjs must stay outside the bundler: they load native
  // binaries and worker files at runtime by absolute path.
  serverExternalPackages: ["playwright", "playwright-core", "pdfjs-dist", "pg"],
  typescript: {
    // The agent runtime is type-checked by `npm run lint` and tsc in CI.
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
