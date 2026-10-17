import type { NextConfig } from "next";
import { BASE_PATH } from "./lib/base-path";

const nextConfig: NextConfig = {
  ...(BASE_PATH ? { basePath: BASE_PATH } : {}),
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
      },
    ],
  },
  env: {
    NEXTAUTH_URL:
      process.env.NEXTAUTH_URL ||
      (BASE_PATH
        ? `https://contributors.zedu.chat${BASE_PATH}/api/auth`
        : "https://issues.zedu.chat/api/auth"),
  },
  async headers() {
    // #222: the app previously sent no security headers at all, which left
    // every page (including /login) framable by any origin and clickable-over.
    //
    // Note on scope: we deliberately do NOT set `default-src` / `script-src`.
    // Next.js injects inline flight-data scripts (`self.__next_f.push(...)`) that
    // would be blocked without a per-request nonce, which in turn requires
    // dynamic rendering. The directives below close the framing hole and the
    // cheap wins without that trade-off. Tightening script-src is worth a
    // follow-up once nonce plumbing exists.
    const securityHeaders = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
      },
      {
        key: "Content-Security-Policy",
        value: [
          "frame-ancestors 'none'",
          "base-uri 'self'",
          "object-src 'none'",
          "form-action 'self'",
        ].join("; "),
      },
    ];

    // HSTS is meaningless over plain http and, for http://localhost, actively
    // unhelpful (browsers may upgrade and break local dev). Only send it when
    // we know we are building for a TLS deployment.
    if (process.env.NODE_ENV === "production") {
      securityHeaders.push({
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains",
      });
    }

    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async redirects() {
    if (!BASE_PATH) {
      return [
        {
          source: "/bug-tracker",
          destination: "/",
          permanent: true,
        },
        {
          source: "/bug-tracker/:path*",
          destination: "/:path*",
          permanent: true,
        },
      ];
    }
    return [];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
