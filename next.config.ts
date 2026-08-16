import type { NextConfig } from 'next'

/**
 * Security headers. The data room serves confidential material, so the policy
 * is deliberately tight: no framing, no referrer leakage to third parties, and
 * a CSP that keeps document rendering inside our own origin.
 */
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
]

const nextConfig: NextConfig = {
  poweredByHeader: false,

  // Confidential documents must never be indexed.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          ...securityHeaders,
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive, nosnippet' },
        ],
      },
    ]
  },

  // pdf.js is imported dynamically from a client component and never runs on
  // the server, so it needs no bundler special-casing. Listing it in
  // serverExternalPackages made the bundler try to `require()` its ESM worker.
}

export default nextConfig
