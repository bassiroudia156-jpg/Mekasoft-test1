// GET/POST /api/payments — Banani PaymentsManagement / RegisterPayment
// (+ inline Bank Transfer/Mobile Money/Chèque sections) /
// PaymentRegisteredConfirmation.
//
// POST validates the body via a Zod discriminated union on `method` — each
// branch requires its own method-specific fields (see
// lib/server/payment-ledger/status.ts for the PAYMENT_METHODS union).
// `amount` is never taken from the client — it's always snapshotted from
// `invoice.amount` server-side (no partial payments, decision #1). A
// successful create always transitions the invoice to `Payée` (decision
// #2) inside the same transaction as the Payment insert + reference
// generation, with a retry-once on reference conflict (same pattern as
// interventions/invoices).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';

import { verifyCsrf } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';
import { requireCallerOrg } from '@/lib/server/organizations/require-caller-org';
import { clampLimit, cursorWhere, buildPage, decodeCursor } from '@/lib/server/pagination/paginate';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { nextPaymentReference } from '@/lib/server/payment-ledger/reference';
import { formatReceiptReference } from '@/lib/server/payment-ledger/receipt';
import { derivePaymentStatus, CHEQUE_STATUSES } from '@/lib/server/payment-ledger/status';

const Q_MAX = 200;

const BaseFields = {
  invoiceId: z.string().min(1, 'Facture requise'),
  paymentDate: z.string().optional(),
  notes: z.string().max(2000).optional(),
  generateReceipt: z.boolean().default(true),
};

const PaymentBody = z.discriminatedUnion('method', [
  z.object({ ...BaseFields, method: z.literal('Espèces') }),
  z.object({
    ...BaseFields,
    method: z.literal('Virement bancaire'),
    bankName: z.string().trim().min(1, 'Banque requise').max(120),
    bankAccountLast4: z.string().max(10).optional(),
    transferReference: z.string().trim().min(1, 'Référence de virement requise').max(60),
    payerName: z.string().max(120).optional(),
  }),
  z.object({
    ...BaseFields,
    method: z.literal('Mobile Money'),
    mobileProvider: z.enum(['Orange Money', 'Wave', 'Free Money']),
    mobilePhone: z.string().max(30).optional(),
    mobileReference: z.string().trim().min(1, 'Référence de transaction requise').max(60),
  }),
  z.object({
    ...BaseFields,
    method: z.literal('Chèque'),
    chequeNumber: z.string().trim().min(1, 'Numéro de chèque requis').max(60),
    chequeBank: z.string().trim().min(1, 'Banque requise').max(120),
    chequeHolder: z.string().max(120).optional(),
    chequeDueDate: z.string().min(1, "Date d'échéance requise"),
    chequeStatus: z.enum(CHEQUE_STATUSES).default('À encaisser'),
  }),
]);

function displayName(c: {
  type: string;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
}) {
  if (c.type === 'COMPANY') return c.companyName ?? '';
  return [c.firstName, c.lastName].filter(Boolean).join(' ');
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireCallerOrg('MEMBER');
    if (auth instanceof NextResponse) return auth;

    const url = req.nextUrl;
    const limit = clampLimit(url.searchParams.get('limit'));
    const q = (url.searchParams.get('q') ?? '').slice(0, Q_MAX).trim();
    const status = url.searchParams.get('status');
    const cursor = decodeCursor(url.searchParams.get('cursor'));

    const where: Prisma.PaymentWhereInput = {
      organizationId: auth.organizationId,
      ...(status ? { status } : {}),
      // 2026-08-18 audit fix: `q`'s own OR and cursorWhere()'s OR were
      // previously both spread as top-level `OR` keys on the same object —
      // the second silently overwrote the first, so a search combined with
      // pagination (page 2+ of search results) quietly dropped the search
      // filter entirely. Nesting both inside `AND` keeps them independent
      // regardless of which are present.
      AND: [
        ...(q
          ? [
              {
                OR: [
                  { reference: { contains: q, mode: 'insensitive' as const } },
                  { invoice: { reference: { contains: q, mode: 'insensitive' as const } } },
                  {
                    client: {
                      OR: [
                        { firstName: { contains: q, mode: 'insensitive' as const } },
                        { lastName: { contains: q, mode: 'insensitive' as const } },
                        { companyName: { contains: q, mode: 'insensitive' as const } },
                      ],
                    },
                  },
                ],
              },
            ]
          : []),
        cursorWhere(cursor),
      ],
    };

    const rows = await prisma.payment.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: {
        id: true,
        reference: true,
        amount: true,
        method: true,
        status: true,
        paymentDate: true,
        createdAt: true,
        invoice: { select: { reference: true } },
        client: { select: { type: true, firstName: true, lastName: true, companyName: true } },
      },
    });

    const page = buildPage(rows, limit);
    const items = page.items.map((row) => ({
      id: row.id,
      reference: row.reference,
      invoiceReference: row.invoice.reference,
      client: displayName(row.client),
      amount: row.amount,
      method: row.method,
      status: row.status,
      paymentDate: row.paymentDate,
      createdAt: row.createdAt,
    }));

    const STATUSES = ['Payé', 'En attente'] as const;
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const overdueCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      total,
      statusCounts,
      pendingAgg,
      paidThisMonthAgg,
      allPaidAgg,
      allPendingAgg,
      overdueInvoices,
    ] = await Promise.all([
      prisma.payment.count({ where: { organizationId: auth.organizationId } }),
      Promise.all(
        STATUSES.map((s) =>
          prisma.payment.count({ where: { organizationId: auth.organizationId, status: s } }),
        ),
      ),
      prisma.payment.aggregate({
        where: { organizationId: auth.organizationId, status: 'En attente' },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.payment.aggregate({
        where: {
          organizationId: auth.organizationId,
          status: 'Payé',
          paymentDate: { gte: monthStart },
        },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.payment.aggregate({
        where: { organizationId: auth.organizationId, status: 'Payé' },
        _sum: { amount: true },
      }),
      prisma.payment.aggregate({
        where: { organizationId: auth.organizationId, status: 'En attente' },
        _sum: { amount: true },
      }),
      prisma.invoice.count({
        where: {
          organizationId: auth.organizationId,
          status: { not: 'Payée' },
          dueDate: { lt: overdueCutoff },
        },
      }),
    ]);

    const counts: Record<string, number> = { total };
    STATUSES.forEach((s, i) => {
      counts[s] = statusCounts[i] ?? 0;
    });

    const allPaid = allPaidAgg._sum.amount ?? 0;
    const allPending = allPendingAgg._sum.amount ?? 0;
    const recoveryRatePct =
      allPaid + allPending > 0 ? Math.round((allPaid / (allPaid + allPending)) * 100) : 0;

    return NextResponse.json(
      {
        items,
        nextCursor: page.nextCursor,
        counts,
        stats: {
          toCollect: { amount: pendingAgg._sum.amount ?? 0, count: pendingAgg._count },
          paidThisMonth: {
            amount: paidThisMonthAgg._sum.amount ?? 0,
            count: paidThisMonthAgg._count,
          },
          recoveryRatePct,
          overdueInvoices,
        },
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireCallerOrg('MEMBER');
    if (auth instanceof NextResponse) return auth;

    const parsed = PaymentBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'INVALID_BODY', issues: parsed.error.issues },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const data = parsed.data;

    const invoice = await prisma.invoice.findFirst({
      where: { id: data.invoiceId, organizationId: auth.organizationId },
      select: {
        id: true,
        reference: true,
        amount: true,
        status: true,
        clientId: true,
        client: {
          select: { type: true, firstName: true, lastName: true, companyName: true, phone: true },
        },
      },
    });
    if (!invoice) {
      return NextResponse.json(
        { error: 'INVOICE_NOT_FOUND' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (invoice.status === 'Payée') {
      return NextResponse.json(
        { error: 'INVOICE_ALREADY_PAID', message: 'Cette facture est déjà payée.' },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const paymentDate = data.paymentDate ? new Date(data.paymentDate) : new Date();
    const clientName = displayName(invoice.client);
    const status = derivePaymentStatus(
      data.method,
      data.method === 'Chèque' ? data.chequeStatus : undefined,
    );

    const methodFields: Partial<Prisma.PaymentUncheckedCreateInput> =
      data.method === 'Virement bancaire'
        ? {
            bankName: data.bankName,
            ...(data.bankAccountLast4 !== undefined
              ? { bankAccountLast4: data.bankAccountLast4 }
              : {}),
            transferReference: data.transferReference,
            payerName: data.payerName ?? clientName,
          }
        : data.method === 'Mobile Money'
          ? {
              mobileProvider: data.mobileProvider,
              mobilePhone: data.mobilePhone ?? invoice.client.phone,
              mobileReference: data.mobileReference,
            }
          : data.method === 'Chèque'
            ? {
                chequeNumber: data.chequeNumber,
                chequeBank: data.chequeBank,
                chequeHolder: data.chequeHolder ?? clientName,
                chequeDueDate: new Date(data.chequeDueDate),
              }
            : {};

    const MAX_ATTEMPTS = 3;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        const payment = await prisma.$transaction(async (tx) => {
          const reference = await nextPaymentReference(tx, auth.organizationId, paymentDate);
          const receiptReference = data.generateReceipt
            ? formatReceiptReference(invoice.reference, reference)
            : null;

          const created = await tx.payment.create({
            data: {
              organizationId: auth.organizationId,
              reference,
              invoiceId: invoice.id,
              clientId: invoice.clientId,
              amount: invoice.amount,
              method: data.method,
              status,
              paymentDate,
              ...(data.notes !== undefined ? { notes: data.notes } : {}),
              generateReceipt: data.generateReceipt,
              ...(receiptReference !== null ? { receiptReference } : {}),
              ...methodFields,
            },
            select: {
              id: true,
              reference: true,
              amount: true,
              method: true,
              status: true,
              paymentDate: true,
              receiptReference: true,
              createdAt: true,
            },
          });

          await tx.invoice.update({ where: { id: invoice.id }, data: { status: 'Payée' } });

          return created;
        });

        return NextResponse.json(
          { payment: { ...payment, invoiceReference: invoice.reference, client: clientName } },
          { status: 201, headers: { 'x-request-id': ctx.requestId } },
        );
      } catch (err) {
        const isConflict =
          typeof err === 'object' &&
          err !== null &&
          'code' in err &&
          (err as { code: unknown }).code === 'P2002';
        if (isConflict && attempt < MAX_ATTEMPTS - 1) continue;
        throw err;
      }
    }

    // Unreachable — the loop above always returns or throws.
    return NextResponse.json(
      { error: 'INTERNAL_ERROR' },
      { status: 500, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
