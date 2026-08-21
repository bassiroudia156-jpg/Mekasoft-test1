// GET /api/admin/dashboard — real data for /admin (Banani "Admin Dashboard
// — Vue d'ensemble" screen). Every number here is a live query — the
// Banani mockup shipped placeholder figures ("12 450", "$22,430"...) which
// this route deliberately does NOT reproduce (2026-08-20 user requirement:
// "vérifier l'exactitude des informations affichées").
//
// Bucketing follows the existing dashboard/stats/route.ts convention:
// fetch raw rows via Prisma, bucket by day in JS — no raw SQL.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/server/prisma';
import { requireAdmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { getPlanPricing } from '@/lib/server/plans/pricing';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const WEEKDAYS_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const RECENT_LIMIT = 8;
const DAY_MS = 86_400_000;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const now = new Date();
    const dayStart = new Date(now.getTime() - DAY_MS);
    const weekStart = new Date(now.getTime() - 7 * DAY_MS);

    const [
      totalUsers,
      activeUsers,
      proOrgCount,
      totalOrgCount,
      proPricing,
      weekPayments,
      recentPayments,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { lastLoginAt: { gte: dayStart } } }),
      prisma.organization.count({ where: { plan: 'PRO' } }),
      prisma.organization.count(),
      getPlanPricing('PRO'),
      prisma.subscriptionPayment.findMany({
        where: { status: 'SUCCEEDED', succeededAt: { gte: weekStart } },
        select: { amount: true, succeededAt: true },
      }),
      prisma.subscriptionPayment.findMany({
        orderBy: { createdAt: 'desc' },
        take: RECENT_LIMIT,
        select: {
          id: true,
          plan: true,
          provider: true,
          amount: true,
          status: true,
          createdAt: true,
          organization: { select: { name: true } },
        },
      }),
    ]);

    const byDay = Array<number>(7).fill(0);
    for (const p of weekPayments) {
      if (!p.succeededAt) continue;
      const idx = Math.floor((p.succeededAt.getTime() - weekStart.getTime()) / DAY_MS);
      if (idx >= 0 && idx < 7) byDay[idx]! += p.amount;
    }
    const maxDay = Math.max(...byDay, 1);
    const bars = WEEKDAYS_FR.map((day, i) => ({
      day,
      value: Math.round((byDay[i]! / maxDay) * 100),
      amount: byDay[i]!,
    }));

    return NextResponse.json(
      {
        kpis: {
          totalUsers,
          activeUsers,
          mrrFcfa: proOrgCount * proPricing.priceFcfa,
          premiumOrgCount: proOrgCount,
          premiumSharePct: totalOrgCount > 0 ? Math.round((proOrgCount / totalOrgCount) * 100) : 0,
        },
        revenueChart: { bars, totalFcfa: byDay.reduce((s, v) => s + v, 0) },
        recentPayments: recentPayments.map((p) => ({
          id: p.id,
          organizationName: p.organization.name,
          plan: p.plan,
          provider: p.provider,
          amount: p.amount,
          status: p.status,
          createdAt: p.createdAt,
        })),
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
