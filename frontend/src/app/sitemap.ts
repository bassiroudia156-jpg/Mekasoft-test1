// Dynamic sitemap.xml (2026-08-20 SEO pass), served at /sitemap.xml by
// Next's file convention. Lists only the pages robots.ts actually allows —
// listing a noindexed/disallowed route in a sitemap sends crawlers a
// contradictory signal, so this stays in lockstep with that file's
// three allowed paths (`/`, `/privacy`, `/terms` — see proxy.ts's
// PUBLIC_PATHS, the same three Server Components that carry their own
// `export const metadata`).
import type { MetadataRoute } from 'next';

const APP_URL = process.env.APP_URL || 'http://localhost:3000';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${APP_URL}/`, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${APP_URL}/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${APP_URL}/terms`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
  ];
}
