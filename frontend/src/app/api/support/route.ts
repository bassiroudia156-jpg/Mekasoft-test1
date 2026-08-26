// POST /api/support — support ticket submission. optionalAuth: a logged-in
// caller's userId/email are trusted from the session; an anonymous caller
// supplies name+email in the body. Rate-limited per email (falls back to
// IP when neither session nor body supplies one — Zod requires email
// either way, so that fallback path is defensive only).
//
// 2026-08-24 audit fix — CSRF: an anonymous caller has no session (nothing
// for CSRF to forge), but an authenticated caller's session IS exposed if
// unchecked — a malicious page could silently submit a ticket attributed
// to a logged-in victim. Only enforce verifyCsrf when a session actually
// exists (same reasoning /api/feedback now applies too).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { optionalAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { zEmail } from '@/lib/server/zod-helpers';
import { createEmailLimiter } from '@/lib/server/middleware/rate-limit-by-email';
import { getRedis } from '@/lib/server/redis';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({
  name: z.string().min(1).max(120),
  email: zEmail,
  subject: z.string().min(1).max(200),
  message: z.string().min(1).max(5000),
});

const redis = getRedis() ?? undefined;
const limiter = createEmailLimiter(
  { ...(redis ? { redis } : {}) },
  {
    bucket: 'support:submit',
    windowMs: 60 * 60 * 1000,
    max: 5,
    code: 'TOO_MANY_SUPPORT_REQUESTS',
    message: 'Too many support requests. Try again later.',
  },
);

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const rl = await limiter.check(req, parsed.data.email);
    if (rl) {
      rl.headers.set('x-request-id', ctx.requestId);
      return rl;
    }

    const auth = await optionalAuth(req.headers.get('authorization'));
    if (auth) {
      const csrfFail = verifyCsrf(req);
      if (csrfFail) return csrfFail;
    }

    const ticket = await prisma.supportTicket.create({
      data: {
        userId: auth?.user.sub ?? null,
        name: parsed.data.name,
        email: parsed.data.email,
        subject: parsed.data.subject,
        message: parsed.data.message,
      },
      select: { id: true, createdAt: true },
    });

    return NextResponse.json(
      { ticket },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
