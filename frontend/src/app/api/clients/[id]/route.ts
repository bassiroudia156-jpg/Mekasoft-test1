// GET /api/clients/[id] — Banani ClientProfileIbrahima.
//
// `interventionsCount` / `totalSpent` / `lastVisit` are now real (Phase 5).
// `totalSpent` sums `Intervention.amount` regardless of payment status —
// Payment doesn't exist until Phase 7, so "spent" currently means "billed",
// not "collected"; revisit once real payment collection ships.
// `interventions[].invoiced` (Phase 6) flags interventions that already
// have an Invoice row, so the invoice-creation picker can filter them out
// client-side (one invoice per intervention, enforced server-side too).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';

import { prisma } from '@/lib/server/prisma';
import { requireCallerOrg } from '@/lib/server/organizations/require-caller-org';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

function displayName(c: {
  type: string;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
}) {
  if (c.type === 'COMPANY') return c.companyName ?? '';
  return [c.firstName, c.lastName].filter(Boolean).join(' ');
}

export async function GET(
  req: NextRequest,
  routeCtx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireCallerOrg('MEMBER');
    if (auth instanceof NextResponse) return auth;

    const { id } = await routeCtx.params;

    const client = await prisma.client.findFirst({
      where: { id, organizationId: auth.organizationId },
      include: {
        vehicles: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            brand: true,
            model: true,
            year: true,
            registration: true,
            mileage: true,
            lastServiceAt: true,
            status: true,
          },
        },
      },
    });
    if (!client) {
      return NextResponse.json(
        { error: 'CLIENT_NOT_FOUND' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const [interventionsCount, amountAgg, lastIntervention, interventions] = await Promise.all([
      prisma.intervention.count({ where: { clientId: id } }),
      prisma.intervention.aggregate({ where: { clientId: id }, _sum: { amount: true } }),
      prisma.intervention.findFirst({
        where: { clientId: id },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
      prisma.intervention.findMany({
        where: { clientId: id },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          reference: true,
          work: true,
          amount: true,
          status: true,
          createdAt: true,
          vehicle: { select: { brand: true, model: true, registration: true } },
          invoice: { select: { id: true } },
        },
      }),
    ]);

    return NextResponse.json(
      {
        client: {
          id: client.id,
          type: client.type,
          name: displayName(client),
          firstName: client.firstName,
          lastName: client.lastName,
          companyName: client.companyName,
          phone: client.phone,
          email: client.email,
          street: client.street,
          city: client.city,
          postalCode: client.postalCode,
          country: client.country,
          notes: client.notes,
          status: client.status,
          createdAt: client.createdAt,
          vehiclesCount: client.vehicles.length,
          interventionsCount,
          totalSpent: amountAgg._sum.amount ?? 0,
          lastVisit: lastIntervention?.createdAt ?? null,
          interventions: interventions.map((i) => ({
            id: i.id,
            reference: i.reference,
            work: i.work,
            vehicle: `${i.vehicle.brand} ${i.vehicle.model} · ${i.vehicle.registration}`,
            amount: i.amount,
            status: i.status,
            createdAt: i.createdAt,
            invoiced: i.invoice !== null,
          })),
          vehicles: client.vehicles.map((v) => ({
            id: v.id,
            brand: v.brand,
            model: v.model,
            year: v.year,
            registration: v.registration,
            mileage: v.mileage,
            lastServiceAt: v.lastServiceAt,
            status: v.status,
          })),
        },
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
