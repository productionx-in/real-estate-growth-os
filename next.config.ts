import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // This allows the production build to successfully complete even with ESLint config errors
    ignoreDuringBuilds: true,
  },
  experimental: {
    turbo: {
      rules: {
        "*.css": {
          loaders: ["@tailwindcss/turbopack"],
          as: "*.css",
        },
      },
    },
  },
};

export default nextConfig;