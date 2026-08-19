// GET /api/dashboard/stats — powers the real (non-empty-state) /dashboard.
//
// Dedicated aggregation route rather than composing /api/interventions +
// /api/payments client-side: the KPIs need month/week-scoped aggregates
// neither list endpoint computes (Terminé count scoped to THIS month,
// revenue bucketed by day for the current ISO week with a real week-over-
// week trend) — see .planning/banani/dashboard-real-data.md decisions #2-6.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/server/prisma';
import { requireCallerOrg } from '@/lib/server/organizations/require-caller-org';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const WEEKDAYS_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const RECENT_LIMIT = 6;

function displayName(c: {
  type: string;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
}) {
  if (c.type === 'COMPANY') return c.companyName ?? '';
  return [c.firstName, c.lastName].filter(Boolean).join(' ');
}

/** Monday 00:00 of the week containing `d` (ISO week, ignores locale). */
function mondayOf(d: Date): Date {
  const isoDow = (d.getDay() + 6) % 7; // Mon=0 .. Sun=6
  const monday = new Date(d);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - isoDow);
  return monday;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireCallerOrg('MEMBER');
    if (auth instanceof NextResponse) return auth;

    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const thisMonday = mondayOf(now);
    const lastMonday = new Date(thisMonday);
    lastMonday.setDate(thisMonday.getDate() - 7);
    const todayIsoDow = (now.getDay() + 6) % 7; // how many full days into this week

    const [
      inProgress,
      unpaid,
      completedThisMonth,
      totalInterventions,
      recentRows,
      revenueThisMonthAgg,
      twoWeeksPayments,
    ] = await Promise.all([
      prisma.intervention.count({
        where: { organizationId: auth.organizationId, status: 'En cours' },
      }),
      prisma.intervention.count({
        where: { organizationId: auth.organizationId, status: 'Non payé' },
      }),
      prisma.intervention.count({
        where: {
          organizationId: auth.organizationId,
          status: 'Terminé',
          updatedAt: { gte: monthStart },
        },
      }),
      prisma.intervention.count({ where: { organizationId: auth.organizationId } }),
      prisma.intervention.findMany({
        where: { organizationId: auth.organizationId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: RECENT_LIMIT,
        select: {
          id: true,
          reference: true,
          work: true,
          amount: true,
          status: true,
          createdAt: true,
          client: { select: { type: true, firstName: true, lastName: true, companyName: true } },
          vehicle: { select: { brand: true, model: true, registration: true } },
        },
      }),
      prisma.payment.aggregate({
        where: {
          organizationId: auth.organizationId,
          status: 'Payé',
          paymentDate: { gte: monthStart },
        },
        _sum: { amount: true },
      }),
      prisma.payment.findMany({
        where: {
          organizationId: auth.organizationId,
          status: 'Payé',
          paymentDate: { gte: lastMonday },
        },
        select: { amount: true, paymentDate: true },
      }),
    ]);

    const recentInterventions = recentRows.map((row) => ({
      id: row.id,
      reference: row.reference,
      client: displayName(row.client),
      vehicle: `${row.vehicle.brand} ${row.vehicle.model} · ${row.vehicle.registration}`,
      work: row.work,
      createdAt: row.createdAt,
      amount: row.amount,
      status: row.status,
    }));

    // Bucket the 2-week window into this-week/last-week × 7 day-buckets.
    const thisWeekByDay = Array<number>(7).fill(0);
    const lastWeekByDay = Array<number>(7).fill(0);
    for (const p of twoWeeksPayments) {
      const dayIndex = Math.floor((p.paymentDate.getTime() - lastMonday.getTime()) / 86_400_000);
      if (dayIndex >= 0 && dayIndex < 7) lastWeekByDay[dayIndex]! += p.amount;
      else if (dayIndex >= 7 && dayIndex < 14) thisWeekByDay[dayIndex - 7]! += p.amount;
    }

    const weekTotal = thisWeekByDay.reduce((s, v) => s + v, 0);
    const maxDay = Math.max(...thisWeekByDay, 1);
    const bars = WEEKDAYS_FR.map((day, i) => ({
      day,
      value: Math.round((thisWeekByDay[i]! / maxDay) * 100),
      amount: thisWeekByDay[i]!,
    }));

    // Trend: week-to-date (Mon..today) vs the same weekday range last week.
    const thisWeekToDate = thisWeekByDay.slice(0, todayIsoDow + 1).reduce((s, v) => s + v, 0);
    const lastWeekToDate = lastWeekByDay.slice(0, todayIsoDow + 1).reduce((s, v) => s + v, 0);
    const trendPct =
      lastWeekToDate > 0
        ? Math.round(((thisWeekToDate - lastWeekToDate) / lastWeekToDate) * 100)
        : null;

    return NextResponse.json(
      {
        inProgress,
        unpaid,
        completedThisMonth,
        revenueThisMonth: revenueThisMonthAgg._sum.amount ?? 0,
        totalInterventions,
        recentInterventions,
        revenueChart: { total: weekTotal, trendPct, bars },
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
