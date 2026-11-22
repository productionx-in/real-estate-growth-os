import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PDF.js loads its worker module at run time on the server (lib/plots/pdf-inspect.ts): keep it unbundled.
  serverExternalPackages: ["pdfjs-dist"],
};

export default nextConfig;
