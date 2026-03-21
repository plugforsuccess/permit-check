import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@sparticuz/chromium-min", "playwright-core", "puppeteer-core", "cheerio"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' js.stripe.com maps.googleapis.com maps.gstatic.com *.googleapis.com plausible.io",
              "style-src 'self' 'unsafe-inline' fonts.googleapis.com maps.googleapis.com",
              "font-src 'self' fonts.gstatic.com",
              "frame-src js.stripe.com",
              "connect-src 'self' *.supabase.co *.upstash.io api.stripe.com *.googleapis.com *.gstatic.com plausible.io",
              "img-src 'self' data: maps.googleapis.com maps.gstatic.com *.googleapis.com *.gstatic.com",
              "worker-src blob:",
              "object-src 'none'",
              "base-uri 'self'",
            ].join("; "),
          },  
        ],
      },
    ];
  },
};

export default nextConfig;