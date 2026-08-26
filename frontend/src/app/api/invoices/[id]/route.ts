// GET/PATCH/DELETE /api/invoices/[id] — Banani InvoiceDetailsFromEmail
// (status Modal+RadioCard) / InvoicesListContextMenu ("Supprimer").
//
// PATCH only covers `status` — the 3-value "Marquer comme..." picker, same
// convenience-action pattern as Intervention (Phase 5). Amount/description
// are immutable snapshots once issued (see route.ts POST comment); editing
// them would require re-deriving from the intervention, which isn't
// designed anywhere in the 109 screens.
//
// DELETE is a real hard delete (decision #8) — no soft-delete/void state
// designed by Banani.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { verifyCsrf } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';
import { requireCallerOrg } from '@/lib/server/organizations/require-caller-org';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const STATUSES = ['Émise', 'Payée', 'En attente'] as const;

const PatchBody = z.object({
  status: z.enum(STATUSES),
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

    const row = await prisma.invoice.findFirst({
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
            email: true,
          },
        },
        intervention: {
          select: {
            id: true,
            reference: true,
            laborAmount: true,
            parts: {
              select: { name: true, quantity: true, unit: true, unitPrice: true, total: true },
              orderBy: { createdAt: 'asc' },
            },
          },
        },
        organization: { select: { name: true, phone: true, city: true } },
      },
    });
    if (!row) {
      return NextResponse.json(
        { error: 'INVOICE_NOT_FOUND' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    return NextResponse.json(
      {
        invoice: {
          id: row.id,
          reference: row.reference,
          status: row.status,
          description: row.description,
          laborAmount: row.intervention.laborAmount,
          parts: row.intervention.parts,
          subtotal: row.subtotal,
          taxRatePct: row.taxRatePct,
          taxAmount: row.taxAmount,
          amount: row.amount,
          paymentTerms: row.paymentTerms,
          issueDate: row.issueDate,
          dueDate: row.dueDate,
          notes: row.notes,
          emailSentAt: row.emailSentAt,
          emailSentTo: row.emailSentTo,
          createdAt: row.createdAt,
          client: {
            id: row.client.id,
            name: displayName(row.client),
            phone: row.client.phone,
            email: row.client.email,
          },
          intervention: { id: row.intervention.id, reference: row.intervention.reference },
          organization: {
            name: row.organization.name,
            phone: row.organization.phone,
            city: row.organization.city,
          },
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

    const existing = await prisma.invoice.findFirst({
      where: { id, organizationId: auth.organizationId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: 'INVOICE_NOT_FOUND' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const updated = await prisma.invoice.update({
      where: { id },
      data: { status: parsed.data.status },
      select: { id: true, status: true },
    });

    return NextResponse.json({ invoice: updated }, { headers: { 'x-request-id': ctx.requestId } });
  });
}

export async function DELETE(
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

    const existing = await prisma.invoice.findFirst({
      where: { id, organizationId: auth.organizationId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: 'INVOICE_NOT_FOUND' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    await prisma.invoice.delete({ where: { id } });

    return NextResponse.json({ ok: true }, { headers: { 'x-request-id': ctx.requestId } });
  });
}
