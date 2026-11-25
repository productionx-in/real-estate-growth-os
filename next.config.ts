import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Vercel's build container ran out of memory compiling the app (OOM, SIGKILL). With the heap cap in package.json's
    // build script, these keep the peak down: webpack frees memory it no longer needs as it goes, and fewer build
    // workers run side by side (each holds its own copy of the module graph). No change to the output.
    webpackMemoryOptimizations: true,
    cpus: 2,
  },
};

export default nextConfig;
