import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // No browser source maps in production builds (the default, stated so it stays that way): less to build and ship.
  productionBrowserSourceMaps: false,
  experimental: {
    // Vercel's 8 GB build container ran out of memory compiling the app (OOM, SIGKILL) although a clean build of the
    // same commit, in a container with the same 2 CPUs and 8 GB, peaks at about 2.6 GB. These keep the peak down:
    // webpack frees memory it no longer needs as it goes, and fewer build workers run side by side.
    webpackMemoryOptimizations: true,
    cpus: 2,
  },
  webpack(config, { dev }) {
    // The difference on Vercel is the restored build cache: production builds there resumed webpack's on-disk cache
    // from earlier builds, which can grow far beyond what compiling the app needs. Production builds compile from
    // scratch instead (about 50 s here), so a stale cache can never take the build down. Development keeps its cache.
    if (!dev) config.cache = false
    return config
  },
};

export default nextConfig;
