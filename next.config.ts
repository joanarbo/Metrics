import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@google-analytics/admin", "@google-analytics/data"],
};

export default nextConfig;
