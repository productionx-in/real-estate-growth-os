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
    // Client router cache: a page visited in the last 30 s (3 min for static pages) is shown again instantly when the
    // person switches back to it from the sidebar, instead of waiting on the server. Saving anything calls
    // router.refresh(), which clears this cache, so people still see their own changes straight away.
    staleTimes: { dynamic: 30, static: 180 },
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
