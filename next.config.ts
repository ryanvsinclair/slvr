import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow phones / other machines on the LAN to load dev assets (/_next/*).
  // Without this, opening http://192.168.x.x:3000 blocks JS chunks and the
  // client-side scroll-to-enter logic never runs.
  allowedDevOrigins: [
    "127.0.0.1",
    "192.168.*.*",
    "10.*.*.*",
    "172.*.*.*",
    "*.local",
  ],
};

export default nextConfig;
