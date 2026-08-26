// GET/PATCH /api/clients/[id] — Banani ClientProfileIbrahima.
//
// `interventionsCount` / `totalSpent` / `lastVisit` are now real (Phase 5).
// `totalSpent` sums `Intervention.amount` regardless of payment status —
// Payment doesn't exist until Phase 7, so "spent" currently means "billed",
// not "collected"; revisit once real payment collection ships.
// `interventions[].invoiced` (Phase 6) flags interventions that already
// have an Invoice row, so the invoice-creation picker can filter them out
// client-side (one invoice per intervention, enforced server-side too).
//
// `billedAmount`/`paidAmount`/`balanceAmount` (Phase C item #10, 2026-08-25)
// — the facturé/payé/solde breakdown on the client profile. Sums
// `Invoice.amount`/`Invoice.amountPaid` across the client's invoices rather
// than reusing `totalSpent` above: `totalSpent` is intervention-level (every
// job ever done, invoiced or not), this is invoice-level and payment-aware.
// `amountPaid` (added same day by the partial-payments feature, PRD
// US-06/P0) is the right source for "paid" now — an invoice can be
// "Partiellement payée" with 0 < amountPaid < amount, so summing only
// status==='Payée' rows would undercount a garage's actual cash collected.
//
// PATCH (Phase C item #6, 2026-08-25): the client profile's "Modifier" was
// dead UI — no route backed it, same class of gap PATCH /api/vehicles/[id]
// closed in Phase 4 (see that file's own header comment). Mirrors it
// closely: all fields optional/additive, one flat body. Deliberately does
// NOT accept `type` — switching a client between INDIVIDUAL/COMPANY makes
// the other shape's required fields (firstName/lastName vs companyName)
// ambiguous and has no real product need; delete-and-recreate covers that
// rare case. `idNumber` is re-encrypted via the same encryptPii() used at
// creation (see clients/route.ts's POST) — never written in plaintext.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { verifyCsrf } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';
import { zPhone } from '@/lib/server/zod-helpers';
import { requireCallerOrg } from '@/lib/server/organizations/require-caller-org';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { encryptPii } from '@/lib/server/clients/pii-crypto';

const PatchClientBody = z
  .object({
    phone: zPhone.optional(),
    email: z.string().email().nullable().optional(),
    street: z.string().max(200).nullable().optional(),
    city: z.string().max(100).nullable().optional(),
    postalCode: z.string().max(20).nullable().optional(),
    country: z.string().max(100).nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
    firstName: z.string().trim().max(100).nullable().optional(),
    lastName: z.string().trim().max(100).nullable().optional(),
    profession: z.string().max(150).nullable().optional(),
    dateOfBirth: z.string().nullable().optional(),
    gender: z.string().max(20).nullable().optional(),
    idNumber: z.string().max(60).nullable().optional(),
    companyName: z.string().trim().max(200).nullable().optional(),
    taxId: z.string().max(60).nullable().optional(),
    sector: z.string().max(150).nullable().optional(),
    contactName: z.string().max(120).nullable().optional(),
    contactRole: z.string().max(100).nullable().optional(),
    contactPhone: z.string().max(30).nullable().optional(),
    contactEmail: z.string().email().nullable().optional(),
    status: z.enum(['actif', 'inactif']).optional(),
  })
  .refine((v) => Object.values(v).some((val) => val !== undefined), {
    message: 'At least one field is required',
  });

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

    const [interventionsCount, amountAgg, lastIntervention, interventions, invoiceAgg] =
      await Promise.all([
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
        prisma.invoice.aggregate({
          where: { clientId: id },
          _sum: { amount: true, amountPaid: true },
        }),
      ]);
    const billedAmount = invoiceAgg._sum.amount ?? 0;
    const paidAmount = invoiceAgg._sum.amountPaid ?? 0;

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
          billedAmount,
          paidAmount,
          balanceAmount: billedAmount - paidAmount,
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

export async function PATCH(
  req: NextRequest,
  routeCtx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireCallerOrg('MEMBER');
    if (auth instanceof NextResponse) return auth;

    const { id } = await routeCtx.params;

    const existing = await prisma.client.findFirst({
      where: { id, organizationId: auth.organizationId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: 'CLIENT_NOT_FOUND' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const parsed = PatchClientBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'INVALID_BODY', issues: parsed.error.issues },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const data = parsed.data;

    const client = await prisma.client.update({
      where: { id },
      data: {
        ...(data.phone !== undefined ? { phone: data.phone } : {}),
        ...(data.email !== undefined ? { email: data.email } : {}),
        ...(data.street !== undefined ? { street: data.street } : {}),
        ...(data.city !== undefined ? { city: data.city } : {}),
        ...(data.postalCode !== undefined ? { postalCode: data.postalCode } : {}),
        ...(data.country !== undefined ? { country: data.country } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
        ...(data.firstName !== undefined ? { firstName: data.firstName } : {}),
        ...(data.lastName !== undefined ? { lastName: data.lastName } : {}),
        ...(data.profession !== undefined ? { profession: data.profession } : {}),
        ...(data.dateOfBirth !== undefined
          ? { dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null }
          : {}),
        ...(data.gender !== undefined ? { gender: data.gender } : {}),
        // See file header + clients/route.ts's POST for the encrypt-at-rest
        // rationale — `null` clears the field (no encryption needed there).
        ...(data.idNumber !== undefined
          ? { idNumber: data.idNumber ? encryptPii(data.idNumber) : null }
          : {}),
        ...(data.companyName !== undefined ? { companyName: data.companyName } : {}),
        ...(data.taxId !== undefined ? { taxId: data.taxId } : {}),
        ...(data.sector !== undefined ? { sector: data.sector } : {}),
        ...(data.contactName !== undefined ? { contactName: data.contactName } : {}),
        ...(data.contactRole !== undefined ? { contactRole: data.contactRole } : {}),
        ...(data.contactPhone !== undefined ? { contactPhone: data.contactPhone } : {}),
        ...(data.contactEmail !== undefined ? { contactEmail: data.contactEmail } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
      },
      select: {
        id: true,
        type: true,
        firstName: true,
        lastName: true,
        companyName: true,
        phone: true,
        email: true,
        street: true,
        city: true,
        postalCode: true,
        country: true,
        notes: true,
        profession: true,
        dateOfBirth: true,
        gender: true,
        taxId: true,
        sector: true,
        contactName: true,
        contactRole: true,
        contactPhone: true,
        contactEmail: true,
        status: true,
      },
    });

    return NextResponse.json(
      { client: { ...client, name: displayName(client) } },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
