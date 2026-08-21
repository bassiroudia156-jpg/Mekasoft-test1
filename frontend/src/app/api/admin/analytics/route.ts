// GET /api/admin/analytics — deeper trends than the /admin dashboard's
// 7-day snapshot: 30-day signups, 30-day revenue, plan distribution, and
// the 10 most active garages by intervention volume. Same "real query, no
// placeholder" rule as dashboard/route.ts.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/server/prisma';
import { requireAdmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const DAY_MS = 86_400_000;
const WINDOW_DAYS = 30;

function bucketByDay(dates: Date[], start: Date, days: number): number[] {
  const buckets = Array<number>(days).fill(0);
  for (const d of dates) {
    const idx = Math.floor((d.getTime() - start.getTime()) / DAY_MS);
    if (idx >= 0 && idx < days) buckets[idx]! += 1;
  }
  return buckets;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const now = new Date();
    const windowStart = new Date(now.getTime() - WINDOW_DAYS * DAY_MS);

    const [signupRows, revenueRows, planCounts, topOrgsRaw] = await Promise.all([
      prisma.user.findMany({
        where: { createdAt: { gte: windowStart } },
        select: { createdAt: true },
      }),
      prisma.subscriptionPayment.findMany({
        where: { status: 'SUCCEEDED', succeededAt: { gte: windowStart } },
        select: { amount: true, succeededAt: true },
      }),
      prisma.organization.groupBy({ by: ['plan'], _count: { _all: true } }),
      prisma.intervention.groupBy({
        by: ['organizationId'],
        where: { createdAt: { gte: windowStart } },
        _count: { _all: true },
        orderBy: { _count: { organizationId: 'desc' } },
        take: 10,
      }),
    ]);

    const signupsByDay = bucketByDay(
      signupRows.map((r) => r.createdAt),
      windowStart,
      WINDOW_DAYS,
    );
    const revenueByDay = Array<number>(WINDOW_DAYS).fill(0);
    for (const r of revenueRows) {
      if (!r.succeededAt) continue;
      const idx = Math.floor((r.succeededAt.getTime() - windowStart.getTime()) / DAY_MS);
      if (idx >= 0 && idx < WINDOW_DAYS) revenueByDay[idx]! += r.amount;
    }

    const topOrgIds = topOrgsRaw.map((r) => r.organizationId);
    const orgNames = await prisma.organization.findMany({
      where: { id: { in: topOrgIds } },
      select: { id: true, name: true, plan: true },
    });
    const nameById = new Map(orgNames.map((o) => [o.id, o]));
    const topGarages = topOrgsRaw.map((r) => ({
      organizationId: r.organizationId,
      name: nameById.get(r.organizationId)?.name ?? '—',
      plan: nameById.get(r.organizationId)?.plan ?? 'FREE',
      interventionCount: r._count._all,
    }));

    const planDistribution = planCounts.map((p) => ({ plan: p.plan, count: p._count._all }));

    return NextResponse.json(
      {
        windowDays: WINDOW_DAYS,
        signupsByDay,
        revenueByDay,
        planDistribution,
        topGarages,
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
