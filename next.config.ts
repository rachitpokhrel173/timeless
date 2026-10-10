import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
