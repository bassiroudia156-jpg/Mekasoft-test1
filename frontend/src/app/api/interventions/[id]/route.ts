// GET/PATCH /api/interventions/[id] — Banani InterventionDetailsView.
//
// PATCH covers both "Modifier le statut" (arbitrary status change via a
// Modal + RadioCard picker) and "Marquer comme payé" (a convenience call
// that sets status → 'Terminé' from the client, same endpoint). Editing
// `laborAmount` and/or `taxRatePct` recomputes the denormalized `amount`
// total against the row's current values for whichever field wasn't
// touched — parts themselves are mutated via the sibling /parts routes,
// which recompute `amount` there instead.
//
// `taxRatePct` is refused once the intervention already has an invoice —
// the Invoice snapshotted its own `taxRatePct` at issue time (see
// /api/invoices POST) and must not silently drift from what was actually
// billed; changing the rate here after that point would desync the two
// without any corresponding real-world change to the invoice.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { verifyCsrf } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';
import { requireCallerOrg } from '@/lib/server/organizations/require-caller-org';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { computeTotals } from '@/lib/server/interventions/totals';

const STATUSES = ['En cours', 'Terminé', 'En attente', 'Non payé'] as const;

const PatchBody = z.object({
  status: z.enum(STATUSES).optional(),
  work: z.string().trim().min(1).max(2000).optional(),
  category: z.string().max(80).optional(),
  priority: z.enum(['Normal', 'Urgente']).optional(),
  notes: z.string().max(2000).optional(),
  laborAmount: z.number().int().min(0).optional(),
  taxRatePct: z.number().int().min(0).max(100).optional(),
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

    const row = await prisma.intervention.findFirst({
      where: { id, organizationId: auth.organizationId },
      include: {
        client: {
          select: {
            id: true,
            type: true,
            firstName: true,
            lastName: true,
            companyName: true,
            phone: true,
          },
        },
        vehicle: {
          select: {
            id: true,
            brand: true,
            model: true,
            year: true,
            registration: true,
            mileage: true,
          },
        },
        parts: { orderBy: { createdAt: 'asc' } },
        invoice: { select: { id: true } },
      },
    });
    if (!row) {
      return NextResponse.json(
        { error: 'INTERVENTION_NOT_FOUND' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const totals = computeTotals(row.laborAmount, row.partsAmount, row.taxRatePct);

    return NextResponse.json(
      {
        intervention: {
          id: row.id,
          reference: row.reference,
          status: row.status,
          work: row.work,
          category: row.category,
          priority: row.priority,
          notes: row.notes,
          laborAmount: row.laborAmount,
          partsAmount: row.partsAmount,
          taxRatePct: row.taxRatePct,
          taxAmount: totals.tax,
          subtotal: totals.subtotal,
          amount: row.amount,
          createdAt: row.createdAt,
          invoiceId: row.invoice?.id ?? null,
          client: { id: row.client.id, name: displayName(row.client), phone: row.client.phone },
          vehicle: {
            id: row.vehicle.id,
            brand: row.vehicle.brand,
            model: row.vehicle.model,
            year: row.vehicle.year,
            registration: row.vehicle.registration,
            mileage: row.vehicle.mileage,
          },
          parts: row.parts.map((p) => ({
            id: p.id,
            reference: p.reference,
            name: p.name,
            supplier: p.supplier,
            quantity: p.quantity,
            unit: p.unit,
            unitPrice: p.unitPrice,
            total: p.total,
            inStock: p.inStock,
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

    const parsed = PatchBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'INVALID_BODY', issues: parsed.error.issues },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const data = parsed.data;

    const existing = await prisma.intervention.findFirst({
      where: { id, organizationId: auth.organizationId },
      select: {
        id: true,
        laborAmount: true,
        partsAmount: true,
        taxRatePct: true,
        invoice: { select: { id: true } },
      },
    });
    if (!existing) {
      return NextResponse.json(
        { error: 'INTERVENTION_NOT_FOUND' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (data.taxRatePct !== undefined && existing.invoice) {
      return NextResponse.json(
        {
          error: 'INTERVENTION_ALREADY_INVOICED',
          message:
            'Cette intervention est déjà facturée — le taux de TVA ne peut plus être modifié.',
        },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const amountChanged = data.laborAmount !== undefined || data.taxRatePct !== undefined;
    const amountPatch = amountChanged
      ? {
          ...(data.laborAmount !== undefined ? { laborAmount: data.laborAmount } : {}),
          ...(data.taxRatePct !== undefined ? { taxRatePct: data.taxRatePct } : {}),
          amount: computeTotals(
            data.laborAmount ?? existing.laborAmount,
            existing.partsAmount,
            data.taxRatePct ?? existing.taxRatePct,
          ).total,
        }
      : {};

    const updated = await prisma.intervention.update({
      where: { id },
      data: {
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.work !== undefined ? { work: data.work } : {}),
        ...(data.category !== undefined ? { category: data.category } : {}),
        ...(data.priority !== undefined ? { priority: data.priority } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
        ...amountPatch,
      },
      select: { id: true, status: true, amount: true, taxRatePct: true },
    });

    return NextResponse.json(
      { intervention: updated },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
