import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Vercel's build container ran out of memory compiling the app (OOM, SIGKILL) once it passed ~110 pages.
    // Lower the peak: webpack frees memory it no longer needs as it goes, and fewer build workers run side by side
    // (each holds its own copy of the module graph). Slightly slower builds, no change to the output.
    webpackMemoryOptimizations: true,
    cpus: 2,
  },
};

export default nextConfig;
