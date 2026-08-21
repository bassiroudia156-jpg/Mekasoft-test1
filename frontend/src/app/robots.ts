// Dynamic robots.txt (2026-08-20 SEO pass), served at /robots.txt by Next's
// file convention. Belt-and-suspenders with proxy.ts's X-Robots-Tag
// header: this keeps crawlers from spending budget on the app/admin surface
// at all, the header is the hard guarantee against any of it getting
// indexed even if linked from elsewhere. Keep PUBLIC_PATHS below in sync
// with proxy.ts's own copy — duplicated rather than imported since one
// is Edge middleware and the other a build-time metadata route, and the
// list is 3 entries long.
import type { MetadataRoute } from 'next';

const APP_URL = process.env.APP_URL || 'http://localhost:3000';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        disallow: '/',
        // `/$` (end-anchor) matches ONLY the exact root path — a bare
        // `Allow: '/'` here would tie in length with `Disallow: '/'`
        // above, and ties resolve in Allow's favor per Google's robots.txt
        // spec, silently un-blocking the entire disallow rule.
        allow: ['/$', '/privacy', '/terms'],
      },
    ],
    sitemap: `${APP_URL}/sitemap.xml`,
  };
}
