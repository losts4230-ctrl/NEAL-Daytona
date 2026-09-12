import type { NextConfig } from "next";

/**
 * Security headers that do not depend on a per-request nonce live here; the
 * Content-Security-Policy is set in middleware.ts because it needs one.
 */
const securityHeaders = [
  { key: "x-content-type-options", value: "nosniff" },
  { key: "x-frame-options", value: "DENY" },
  { key: "referrer-policy", value: "strict-origin-when-cross-origin" },
  {
    key: "permissions-policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  {
    key: "strict-transport-security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "cross-origin-opener-policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // Fail the build on a type error or lint error rather than shipping one.
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: false },

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
