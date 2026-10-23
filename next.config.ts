import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev only: lets a phone on the same Wi-Fi open the dev server by the PC's address (e.g.
  // http://192.168.x.x:3000). Without it Next blocks dev resources from that origin, so the
  // page never becomes interactive — menus don't open and you can't sign out.
  allowedDevOrigins: ["192.168.*.*"],
  images: {
    formats: ["image/avif", "image/webp"],
  },
  experimental: {
    // Admin uploads (photos, documents) go through server actions. Large photos are downscaled in
    // the browser first, so real requests stay well under hosting limits (Vercel: 4.5 MB).
    serverActions: { bodySizeLimit: "16mb" },
  },
};

export default nextConfig;
