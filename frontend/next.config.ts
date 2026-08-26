import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

// Static security headers applied to every response.
// Set via next.config.ts (not proxy.ts) so Vercel's edge can serve them
// from the CDN cache without invoking a function — zero per-request latency.
//
// CSP — security audit fix (2026-08-24, control #18). The original comment
// here said CSP would ship "when the first frontend page lands"; that
// happened over the course of this project (login/signup/dashboard/…) and
// the header was never added. Deliberately the *static* (no-nonce) variant
// from Next's own CSP guide (node_modules/next/dist/docs/.../
// content-security-policy.md, "Without Nonces" section) rather than the
// proxy.ts nonce/'strict-dynamic' variant: nonces require EVERY page to opt
// into dynamic rendering (disables static optimization/ISR site-wide, per
// that same doc), which is too invasive to land and verify safely across
// this app's full page set in one pass. This is the weaker-but-real
// version — 'unsafe-inline' on script-src is required because the App
// Router injects inline RSC-hydration <script> tags with no nonce
// mechanism outside the proxy.ts path, so classic inline-<script>
// injection isn't blocked by this policy — but object-src, base-uri,
// frame-ancestors, form-action and remote-script/frame origins all are,
// which closes off most real exfiltration/clickjacking primitives. Revisit
// with the proxy.ts nonce approach if a stricter script-src is needed later.
//
// Origins allowed beyond 'self', and why (verified by grep across src/ —
// keep this list in sync if a new external resource is added):
//   - https://res.cloudinary.com (img-src)   — Cloudinary secure_url, the
//     only image CDN this app renders (lib/server/storage.ts)
//   - https://challenges.cloudflare.com (script-src/frame-src/connect-src)
//     — Turnstile widget script + its internal iframe (control #12 fix,
//     components/auth/Turnstile.tsx); inert/unused until
//     NEXT_PUBLIC_TURNSTILE_SITE_KEY is set, but harmless to allow now
//   - https://*.sentry.io / https://*.ingest.sentry.io (connect-src) —
//     error/trace ingest; inert until NEXT_PUBLIC_SENTRY_DSN is set
const isDev = process.env.NODE_ENV === 'development';
const cspDirectives = [
  `default-src 'self'`,
  `script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com${isDev ? ` 'unsafe-eval'` : ''}`,
  `style-src 'self' 'unsafe-inline'`,
  `img-src 'self' data: blob: https://res.cloudinary.com`,
  `font-src 'self' data:`,
  `connect-src 'self' https://challenges.cloudflare.com https://*.sentry.io https://*.ingest.sentry.io`,
  `frame-src https://challenges.cloudflare.com`,
  `object-src 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
  `frame-ancestors 'none'`,
  `upgrade-insecure-requests`,
];

const securityHeaders = [
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  { key: 'Content-Security-Policy', value: cspDirectives.join('; ') },
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
  // 2026-08-22: `disableLogger` is deprecated in @sentry/nextjs 10.x in
  // favor of this nested option (same effect — strips Sentry SDK logger
  // statements from the bundle; doesn't affect Sentry Logs).
  webpack: {
    treeshake: {
      removeDebugLogging: true,
    },
  },
});
