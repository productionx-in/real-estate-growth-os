import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // This allows the production build to successfully complete even with ESLint config errors
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;