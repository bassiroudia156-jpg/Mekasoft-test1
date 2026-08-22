import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

// Static security headers applied to every response.
// Set via next.config.ts (not proxy.ts) so Vercel's edge can serve them
// from the CDN cache without invoking a function — zero per-request latency.
//
// CSP is intentionally NOT included here. App Router pages need a per-request
// nonce (server-rendered) for inline scripts; ship CSP via proxy.ts (renamed
// from middleware.ts, 2026-08-20 — Next.js 16 deprecated that convention,
// see proxy.ts's own header comment) when the first frontend page lands.
// For now, the API-only surface doesn't render HTML and doesn't need CSP.
const securityHeaders = [
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
];

const config: NextConfig = {
  reactStrictMode: true,
  // 2026-08-22: `output: 'standalone'` REMOVED — it was only ever needed by
  // `frontend/Dockerfile`, which was deleted during an earlier
  // simplification pass (the kit is cloud-only/Vercel-only now, see
  // WORKFLOW.md and STATUS.md's "removed in the simplification waves"
  // note). Left enabled with no Docker image consuming it, it actively
  // breaks Vercel deploys: standalone mode reorganizes `.next/`'s output
  // layout, and Vercel's own build packaging step (`onBuildComplete`) can't
  // find `next-server.js.nft.json` where it expects it → the build fails
  // with `ENOENT: .../.next/next-server.js.nft.json`. Vercel already
  // produces its own optimized serverless output — don't set this on
  // Vercel. Revisit only if a real Docker/self-hosted target comes back.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

// Sentry build-time wrapper. Uploads source maps when SENTRY_AUTH_TOKEN +
// SENTRY_ORG + SENTRY_PROJECT are present (typically only in CI). Without
// those env vars the wrapper still works — it just skips the upload step.
// silent:true keeps the build log clean when nothing is configured.
export default withSentryConfig(config, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  // Tunnel client requests through a Next.js route to bypass ad-blockers
  // that filter direct Sentry calls. Off by default — turn on if your
  // user base has heavy ad-blocker usage.
  // tunnelRoute: '/monitoring',
  hideSourceMaps: true,
  disableLogger: true,
});
