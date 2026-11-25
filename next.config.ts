import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@node-rs/argon2", "@prisma/client"],
  poweredByHeader: false,
  reactStrictMode: true,
  // Teacher pages used to live under /teacher. Old links, bookmarks and home-screen shortcuts still open.
  async redirects() {
    return [
      { source: "/teacher", destination: "/", permanent: false },
      { source: "/teacher/:path*", destination: "/:path*", permanent: false },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        // Always revalidate the service worker so new releases reach installed apps.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
