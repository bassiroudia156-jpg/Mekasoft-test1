// Monthly activity report aggregation — Premium-plan feature
// (PLAN_LIMITS.PRO.features.monthlyReport; 2026-08-20: was Business-only,
// merged into PRO/"Premium" — see lib/server/plans/limits.ts's header
// comment). Separated from the PDF renderer (pdf.tsx) so the numbers are
// unit-testable without pulling in @react-pdf/renderer.
import 'server-only';
import type { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '@/lib/server/prisma';

export interface MonthlyReportData {
  organizationName: string;
  periodLabel: string; // "Août 2026"
  newClients: number;
  newVehicles: number;
  interventionsCreated: number;
  interventionsCompleted: number;
  revenueFcfa: number;
  unpaidInvoices: number;
  topClients: { name: string; revenueFcfa: number }[];
}

function displayName(c: {
  type: string;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
}): string {
  if (c.type === 'COMPANY') return c.companyName ?? '';
  return [c.firstName, c.lastName].filter(Boolean).join(' ');
}

/** `month` is a JS Date anywhere inside the target month — defaults to now
 * (the current calendar month, UTC-bucketed to match dashboard/stats's own
 * `monthStart` convention). */
export async function buildMonthlyReport(
  organizationId: string,
  organizationName: string,
  month: Date = new Date(),
  prisma: Pick<
    PrismaClient,
    'client' | 'vehicle' | 'intervention' | 'invoice' | 'payment'
  > = defaultPrisma,
): Promise<MonthlyReportData> {
  const monthStart = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1));
  const periodLabel = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(
    monthStart,
  );

  const [
    newClients,
    newVehicles,
    interventionsCreated,
    interventionsCompleted,
    unpaidInvoices,
    payments,
  ] = await Promise.all([
    prisma.client.count({
      where: { organizationId, createdAt: { gte: monthStart, lt: monthEnd } },
    }),
    prisma.vehicle.count({
      where: { organizationId, createdAt: { gte: monthStart, lt: monthEnd } },
    }),
    prisma.intervention.count({
      where: { organizationId, createdAt: { gte: monthStart, lt: monthEnd } },
    }),
    prisma.intervention.count({
      where: {
        organizationId,
        status: 'Terminé',
        updatedAt: { gte: monthStart, lt: monthEnd },
      },
    }),
    prisma.invoice.count({
      where: { organizationId, status: { not: 'Payée' }, dueDate: { lt: new Date() } },
    }),
    prisma.payment.findMany({
      where: {
        organizationId,
        status: 'Payé',
        paymentDate: { gte: monthStart, lt: monthEnd },
      },
      select: {
        amount: true,
        client: { select: { type: true, firstName: true, lastName: true, companyName: true } },
      },
    }),
  ]);

  const revenueFcfa = payments.reduce((sum, p) => sum + p.amount, 0);

  const byClient = new Map<string, number>();
  for (const p of payments) {
    const name = displayName(p.client) || 'Client';
    byClient.set(name, (byClient.get(name) ?? 0) + p.amount);
  }
  const topClients = [...byClient.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, revenueFcfa2]) => ({ name, revenueFcfa: revenueFcfa2 }));

  return {
    organizationName,
    periodLabel,
    newClients,
    newVehicles,
    interventionsCreated,
    interventionsCompleted,
    revenueFcfa,
    unpaidInvoices,
    topClients,
  };
}
