/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-Robots-Tag",
            value: "noindex, nofollow, noarchive, noimageindex"
          }
        ]
      },
      // CORS allowance for Expo + EAS native PoC (Issue #89)
      // Permits: expo:// (standalone/dev client), localhost:8081 (Expo Metro dev server)
      // Also covers common dev origins for fetch connectivity to /api/*
      {
        source: "/api/:path*",
        headers: [
          {
            key: "Access-Control-Allow-Origin",
            value: "*"
          },
          {
            key: "Access-Control-Allow-Methods",
            value: "GET,POST,PUT,DELETE,OPTIONS"
          },
          {
            key: "Access-Control-Allow-Headers",
            value: "Content-Type, Authorization, Accept"
          }
        ]
      }
    ];
  }
};

export default nextConfig;
