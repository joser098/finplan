import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  poweredByHeader: false,
  distDir: process.env.FINPLAN_BUILD_DIR || ".next",
};

export default nextConfig;
