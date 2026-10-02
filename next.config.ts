import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Jamak's personality is read from disk when a voice session starts, so deployments
  // must ship the file alongside the route.
  outputFileTracingIncludes: {
    "/api/realtime/session": ["./config/personality.md"],
  },
};

export default nextConfig;
