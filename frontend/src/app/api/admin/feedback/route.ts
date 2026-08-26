// GET /api/admin/feedback — ADMIN-readable list, optional ?reviewed filter.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const reviewedParam = req.nextUrl.searchParams.get('reviewed');
    const feedback = await prisma.feedback.findMany({
      where: reviewedParam !== null ? { reviewed: reviewedParam === 'true' } : {},
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return NextResponse.json({ feedback }, { headers: { 'x-request-id': ctx.requestId } });
  });
}
