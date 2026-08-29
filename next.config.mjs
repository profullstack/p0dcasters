/** @type {import('next').NextConfig} */

// Deliberately not a script-src CSP. This page pulls artwork from 13k publisher
// domains and audio from as many again, and the ad and analytics loaders inject
// their own markup — a source allowlist over that is a list nobody can keep
// correct, and getting it wrong takes the artwork out silently. The headers
// here are the ones that are unambiguous on a site with no user-generated HTML.
// frame-ancestors is the clickjacking control and constrains only who may embed
// us, so it costs nothing to set.
const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    // Safe here: http already 301s to https, and the apex has no subdomains.
    // No preload — that list is one-way and its own operator discourages it.
    value: "max-age=31536000; includeSubDomains",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
  // The legacy half of the same control, for browsers that predate it.
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Features this site does not use. WebAuthn is intentionally absent from the
  // list: naming publickey-credentials-* here would disable passkey sign-in.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
];

const nextConfig = {
  reactStrictMode: true,
  images: { unoptimized: true },
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};
export default nextConfig;
