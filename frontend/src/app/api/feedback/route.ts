// POST /api/feedback — one-way product feedback (message + optional 1-5
// rating). optionalAuth, rate-limited per-IP (no email field on this form —
// unlike support tickets, there's no reply to send, so no address to key
// the limiter on; pass null to route onto the IP fallback).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { optionalAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { createEmailLimiter } from '@/lib/server/middleware/rate-limit-by-email';
import { getRedis } from '@/lib/server/redis';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({
  message: z.string().min(1).max(2000),
  rating: z.number().int().min(1).max(5).nullable().optional(),
});

const redis = getRedis() ?? undefined;
const limiter = createEmailLimiter(
  { ...(redis ? { redis } : {}) },
  {
    bucket: 'feedback:submit',
    windowMs: 60 * 60 * 1000,
    max: 10,
    code: 'TOO_MANY_FEEDBACK_SUBMISSIONS',
    message: 'Too many feedback submissions. Try again later.',
  },
);

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const rl = await limiter.check(req, null);
    if (rl) {
      rl.headers.set('x-request-id', ctx.requestId);
      return rl;
    }

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const auth = await optionalAuth(req.headers.get('authorization'));

    const feedback = await prisma.feedback.create({
      data: {
        userId: auth?.user.sub ?? null,
        message: parsed.data.message,
        rating: parsed.data.rating ?? null,
      },
      select: { id: true, createdAt: true },
    });

    return NextResponse.json(
      { feedback },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
