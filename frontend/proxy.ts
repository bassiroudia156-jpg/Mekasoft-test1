import { NextResponse, type NextRequest } from 'next/server';

// Silent-refresh gate for protected pages.
//
// The (15-min) access cookie can expire while a (7-day) refresh cookie is
// still valid — typically when a tab sat unfocused or the laptop slept. The
// (authed) layout calling /api/auth/me would 401 and the user would be kicked
// to /login. This proxy catches that case BEFORE the page renders and
// bounces the request through /api/auth/refresh-and-return, which mints fresh
// cookies and 302s back to the original URL — invisible to the user.
//
// Protected paths are configured via AUTH_PROTECTED_PREFIXES (comma-separated,
// e.g. "/dashboard,/account"). Empty by default — the API surface is the only
// thing shipped, so out-of-the-box this proxy is a no-op.
//
// 2026-08-20: renamed from middleware.ts — Next.js 16 deprecated the
// `middleware` file convention in favor of `proxy` (same runtime concept,
// new name/export; see node_modules/next/dist/docs/.../proxy.md's "Migration
// to Proxy" section). This was a HARD rename, not a soft deprecation with a
// fallback: `middleware.ts` at either the project root or under src/ was
// silently never invoked at all under Next 16.3.1 (verified empirically —
// no response ever carried a header this file sets, on any route, with the
// dev server confirmed up and serving requests). That means the silent-
// refresh gate below has likely been inert since whenever this project
// moved to Next 16, unnoticed only because AUTH_PROTECTED_PREFIXES is empty
// by default (a no-op either way). Proxy also now defaults to the Node.js
// runtime (was Edge-only for middleware) and no longer accepts a `runtime`
// export at all — setting one throws — so the old "Edge runtime: no DB, no
// bcrypt, no Prisma" constraint this file used to note no longer applies;
// nothing here needs those anyway (cookie inspection + redirects only), so
// no other change was needed.
//
// SEO noindex pass (2026-08-20) added below, in the same function rather
// than a second proxy file — Next.js only recognizes one per project (this
// one, at the frontend root). Stamps `X-Robots-Tag: noindex, nofollow` on
// every response except the 3 public marketing/legal pages: every real app
// route in this codebase is a 'use client' page (dashboard, clients,
// vehicles, admin/*, every auth screen…) and Next's Metadata API can only
// export `robots` from a Server Component, so there is no per-page way to
// noindex those ~35 routes — this one pass does it for all of them, and
// fails safe (a route added later stays noindexed by default unless
// explicitly added to PUBLIC_PATHS, rather than leaking into search
// results by omission). Layered with robots.ts's Disallow rules and each
// public page's own `robots: { index: true }` override — see that file's
// header comment for the full policy.

const COOKIE_PREFIX = process.env.COOKIE_PREFIX || 'app';
const ACCESS_COOKIE = `${COOKIE_PREFIX}-token`;
const REFRESH_COOKIE = `${COOKIE_PREFIX}-refresh`;
const LOGIN_PATH = process.env.AUTH_LOGIN_PATH || '/login';

const AUTHED_PREFIXES = (process.env.AUTH_PROTECTED_PREFIXES || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function isAuthedPath(pathname: string): boolean {
  return AUTHED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

// Keep in sync with robots.ts's Disallow allowlist and each of these 3
// pages' own `export const metadata` (page.tsx, privacy/page.tsx,
// terms/page.tsx).
const SEO_PUBLIC_PATHS = new Set(['/', '/privacy', '/terms']);

function withRobotsHeader(req: NextRequest, res: NextResponse): NextResponse {
  if (!SEO_PUBLIC_PATHS.has(req.nextUrl.pathname)) {
    res.headers.set('X-Robots-Tag', 'noindex, nofollow');
  }
  return res;
}

export function proxy(req: NextRequest): NextResponse {
  if (AUTHED_PREFIXES.length === 0) return withRobotsHeader(req, NextResponse.next());

  const { pathname, search } = req.nextUrl;
  if (!isAuthedPath(pathname)) return withRobotsHeader(req, NextResponse.next());

  if (req.cookies.get(ACCESS_COOKIE)?.value) {
    return withRobotsHeader(req, NextResponse.next());
  }

  const target = pathname + search;

  if (!req.cookies.get(REFRESH_COOKIE)?.value) {
    const url = req.nextUrl.clone();
    url.pathname = LOGIN_PATH;
    url.search = `?next=${encodeURIComponent(target)}`;
    return withRobotsHeader(req, NextResponse.redirect(url, 303));
  }

  const url = req.nextUrl.clone();
  url.pathname = '/api/auth/refresh-and-return';
  url.search = `?next=${encodeURIComponent(target)}`;
  return withRobotsHeader(req, NextResponse.redirect(url, 303));
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/|.*\\..*).*)'],
};
