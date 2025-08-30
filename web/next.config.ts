import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

const csp = [
  "default-src 'self'",
  // Allow inline and blob scripts for Next.js runtime and data hydration
  // Keep 'unsafe-eval' to support some React/Next internals; remove later if not needed
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://avatars.githubusercontent.com https://api.dicebear.com",
  "font-src 'self' data:",
  // Allow fetch/XHR to same-origin; include Vercel vitals endpoint if used
  "connect-src 'self' https://vitals.vercel-insights.com",
  // Allow web workers if needed by Next/Turbopack
  "worker-src 'self' blob:",
  // In dev, also allow WS for HMR
  ...(isProd ? [] : ["connect-src ws: wss:"]),
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
        pathname: "/u/**",
      },
      {
        protocol: "https",
        hostname: "api.dicebear.com",
        pathname: "/9.x/**",
      },
    ],
  },
  async headers() {
    // Always set security headers; CSP is relaxed automatically in dev via directives above
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Permissions-Policy", value: "geolocation=(), camera=(), microphone=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
