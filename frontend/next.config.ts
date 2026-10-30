import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produces .next/standalone: a minimal, self-contained server bundle used
  // to run the app inside the packaged Electron desktop app. Doesn't change
  // `next dev`/`next start` behavior for normal web deployments.
  output: "standalone",
};

export default nextConfig;
