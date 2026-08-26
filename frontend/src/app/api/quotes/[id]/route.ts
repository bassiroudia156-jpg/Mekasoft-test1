// GET/PATCH /api/quotes/[id] — quote detail + edit.
//
// PATCH is only allowed while status === 'DRAFT' — once a quote has been
// SENT, its content is what the client actually saw/responded to; editing
// it afterward would silently invalidate that record. Unlike Intervention
// (parts added/removed one at a time via sibling /parts routes), a DRAFT
// quote's parts array is replaced wholesale on every PATCH — simpler for
// what's a short-lived editing session before sending, not an
// incrementally-built-up-over-days work order.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { verifyCsrf } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';
import { requireCallerOrg } from '@/lib/server/organizations/require-caller-org';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { computeTotals } from '@/lib/server/interventions/totals';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const QuotePartInput = z.object({
  name: z.string().trim().min(1, 'Dénomination requise').max(150),
  supplier: z.string().max(120).optional(),
  quantity: z.number().int().min(1).default(1),
  unit: z.string().max(20).default('pcs'),
  unitPrice: z.number().int().min(0),
});

const PatchQuoteBody = z
  .object({
    work: z.string().trim().min(1).max(2000).optional(),
    laborAmount: z.number().int().min(0).optional(),
    partsAmount: z.number().int().min(0).optional(),
    parts: z.array(QuotePartInput).optional(),
    taxRatePct: z.number().int().min(0).max(100).optional(),
    notes: z.string().max(2000).nullable().optional(),
    validityDays: z.number().int().min(1).max(365).optional(),
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

    const row = await prisma.quote.findFirst({
      where: { id, organizationId: auth.organizationId },
      include: {
        client: {
          select: { type: true, firstName: true, lastName: true, companyName: true, phone: true },
        },
        vehicle: {
          select: { brand: true, model: true, year: true, registration: true, mileage: true },
        },
        parts: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!row) {
      return NextResponse.json(
        { error: 'QUOTE_NOT_FOUND' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    return NextResponse.json(
      {
        quote: {
          id: row.id,
          reference: row.reference,
          status: row.status,
          work: row.work,
          notes: row.notes,
          laborAmount: row.laborAmount,
          partsAmount: row.partsAmount,
          taxRatePct: row.taxRatePct,
          taxAmount: row.taxAmount,
          subtotal: row.subtotal,
          amount: row.amount,
          token: row.token,
          validUntil: row.validUntil,
          sentAt: row.sentAt,
          respondedAt: row.respondedAt,
          respondedByName: row.respondedByName,
          interventionId: row.interventionId,
          createdAt: row.createdAt,
          client: { id: row.clientId, name: displayName(row.client), phone: row.client.phone },
          vehicle: {
            id: row.vehicleId,
            brand: row.vehicle.brand,
            model: row.vehicle.model,
            year: row.vehicle.year,
            registration: row.vehicle.registration,
            mileage: row.vehicle.mileage,
          },
          parts: row.parts.map((p) => ({
            id: p.id,
            name: p.name,
            supplier: p.supplier,
            quantity: p.quantity,
            unit: p.unit,
            unitPrice: p.unitPrice,
            total: p.total,
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

    const existing = await prisma.quote.findFirst({
      where: { id, organizationId: auth.organizationId },
      select: {
        id: true,
        status: true,
        work: true,
        laborAmount: true,
        partsAmount: true,
        taxRatePct: true,
      },
    });
    if (!existing) {
      return NextResponse.json(
        { error: 'QUOTE_NOT_FOUND' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (existing.status !== 'DRAFT') {
      return NextResponse.json(
        {
          error: 'QUOTE_NOT_EDITABLE',
          message: 'Seul un devis en brouillon peut être modifié.',
        },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const parsed = PatchQuoteBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'INVALID_BODY', issues: parsed.error.issues },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const data = parsed.data;

    const laborAmount = data.laborAmount ?? existing.laborAmount;
    const taxRatePct = data.taxRatePct ?? existing.taxRatePct;
    const itemizedParts =
      data.parts !== undefined
        ? data.parts.map((p) => ({
            name: p.name,
            ...(p.supplier !== undefined ? { supplier: p.supplier } : {}),
            quantity: p.quantity,
            unit: p.unit,
            unitPrice: p.unitPrice,
            total: p.quantity * p.unitPrice,
          }))
        : undefined;
    const partsAmount =
      itemizedParts !== undefined
        ? itemizedParts.length > 0
          ? itemizedParts.reduce((sum, p) => sum + p.total, 0)
          : (data.partsAmount ?? existing.partsAmount)
        : (data.partsAmount ?? existing.partsAmount);
    const totals = computeTotals(laborAmount, partsAmount, taxRatePct);

    const quote = await prisma.$transaction(async (tx) => {
      if (itemizedParts !== undefined) {
        await tx.quotePart.deleteMany({ where: { quoteId: id } });
      }
      return tx.quote.update({
        where: { id },
        data: {
          ...(data.work !== undefined ? { work: data.work } : {}),
          laborAmount,
          partsAmount,
          taxRatePct,
          taxAmount: totals.tax,
          subtotal: totals.subtotal,
          amount: totals.total,
          ...(data.notes !== undefined ? { notes: data.notes } : {}),
          ...(data.validityDays !== undefined
            ? { validUntil: new Date(Date.now() + data.validityDays * ONE_DAY_MS) }
            : {}),
          ...(itemizedParts !== undefined && itemizedParts.length > 0
            ? { parts: { create: itemizedParts } }
            : {}),
        },
        select: {
          id: true,
          reference: true,
          work: true,
          amount: true,
          status: true,
          validUntil: true,
        },
      });
    });

    return NextResponse.json({ quote }, { headers: { 'x-request-id': ctx.requestId } });
  });
}
