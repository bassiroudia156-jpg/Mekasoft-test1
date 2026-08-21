// GET/POST /api/invoices — Banani InvoicesList / NewInvoice / NewInvoiceFresh
// / InvoiceCreatedSuccess.
//
// POST snapshots `description`/`subtotal`/`taxRatePct`/`taxAmount`/`amount`
// off the source Intervention at issue time (invoices must not silently
// drift if the intervention is edited later — decision #? in
// phase-6-invoices.md). `interventionId` is `@@unique`, so a second POST
// for an already-invoiced intervention is rejected 409 — checked
// proactively (not caught as a P2002) for the same "explicit check beats
// pattern-matching the driver error" reason as vehicles/[id]'s DELETE.
// On success, if the client has an email on file, an `email.invoice`
// outbox event is enqueued in the same transaction (auto-send, per
// Banani's own copy) — silently skipped otherwise, same "optional
// providers are inert" philosophy as the rest of the app.
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
import { enqueueOutbox } from '@/lib/server/outbox';
import { nextInvoiceReference } from '@/lib/server/invoices/reference';
import {
  computeInvoiceTotals,
  dueDateFromTerms,
  PAYMENT_TERMS,
} from '@/lib/server/invoices/totals';

const Q_MAX = 200;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PAYMENT_TERM_VALUES = PAYMENT_TERMS.map((t) => t.value) as [string, ...string[]];

const InvoiceBody = z.object({
  interventionId: z.string().min(1, 'Intervention requise'),
  paymentTerms: z.enum(PAYMENT_TERM_VALUES).default('Net 30 jours'),
  notes: z.string().max(2000).optional(),
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

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireCallerOrg('MEMBER');
    if (auth instanceof NextResponse) return auth;

    const url = req.nextUrl;
    const limit = clampLimit(url.searchParams.get('limit'));
    const q = (url.searchParams.get('q') ?? '').slice(0, Q_MAX).trim();
    const status = url.searchParams.get('status');
    // 2026-08-21 audit fix: date-range filtering was already wired for
    // /api/interventions but never added here despite the invoices list
    // page needing the same "filtrer par date" capability — same DATE_RE
    // validation + inclusive gte/lte-on-createdAt pattern as that route.
    const dateFromRaw = url.searchParams.get('dateFrom');
    const dateToRaw = url.searchParams.get('dateTo');
    const dateFrom = dateFromRaw && DATE_RE.test(dateFromRaw) ? dateFromRaw : null;
    const dateTo = dateToRaw && DATE_RE.test(dateToRaw) ? dateToRaw : null;
    const cursor = decodeCursor(url.searchParams.get('cursor'));

    const where: Prisma.InvoiceWhereInput = {
      organizationId: auth.organizationId,
      ...(status ? { status } : {}),
      ...(dateFrom || dateTo
        ? {
            createdAt: {
              ...(dateFrom ? { gte: new Date(`${dateFrom}T00:00:00.000Z`) } : {}),
              ...(dateTo ? { lte: new Date(`${dateTo}T23:59:59.999Z`) } : {}),
            },
          }
        : {}),
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
                  { description: { contains: q, mode: 'insensitive' as const } },
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

    const rows = await prisma.invoice.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: {
        id: true,
        reference: true,
        description: true,
        amount: true,
        status: true,
        issueDate: true,
        dueDate: true,
        createdAt: true,
        emailSentAt: true,
        client: { select: { type: true, firstName: true, lastName: true, companyName: true } },
      },
    });

    const page = buildPage(rows, limit);
    const items = page.items.map((row) => ({
      id: row.id,
      reference: row.reference,
      client: displayName(row.client),
      description: row.description,
      amount: row.amount,
      status: row.status,
      issueDate: row.issueDate,
      dueDate: row.dueDate,
      createdAt: row.createdAt,
      emailSentAt: row.emailSentAt,
    }));

    const STATUSES = ['Émise', 'Payée', 'En attente'] as const;
    const [total, statusCounts, amountAgg] = await Promise.all([
      prisma.invoice.count({ where: { organizationId: auth.organizationId } }),
      Promise.all(
        STATUSES.map((s) =>
          prisma.invoice.count({ where: { organizationId: auth.organizationId, status: s } }),
        ),
      ),
      prisma.invoice.aggregate({
        where: { organizationId: auth.organizationId },
        _sum: { amount: true },
      }),
    ]);

    const counts: Record<string, number> = { total };
    STATUSES.forEach((s, i) => {
      counts[s] = statusCounts[i] ?? 0;
    });

    return NextResponse.json(
      {
        items,
        nextCursor: page.nextCursor,
        counts,
        totalAmount: amountAgg._sum.amount ?? 0,
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

    const parsed = InvoiceBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'INVALID_BODY', issues: parsed.error.issues },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const data = parsed.data;

    const intervention = await prisma.intervention.findFirst({
      where: { id: data.interventionId, organizationId: auth.organizationId },
      select: {
        id: true,
        clientId: true,
        work: true,
        laborAmount: true,
        partsAmount: true,
        taxRatePct: true,
        invoice: { select: { id: true } },
        client: { select: { email: true } },
      },
    });
    if (!intervention) {
      return NextResponse.json(
        { error: 'INTERVENTION_NOT_FOUND' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (intervention.invoice) {
      return NextResponse.json(
        {
          error: 'INTERVENTION_ALREADY_INVOICED',
          message: 'Cette intervention a déjà une facture.',
        },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const subtotal = intervention.laborAmount + intervention.partsAmount;
    const totals = computeInvoiceTotals(subtotal, intervention.taxRatePct);
    const issueDate = new Date();
    const dueDate = dueDateFromTerms(issueDate, data.paymentTerms);
    const clientEmail = intervention.client.email;

    const MAX_ATTEMPTS = 3;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        const invoice = await prisma.$transaction(async (tx) => {
          const reference = await nextInvoiceReference(tx, auth.organizationId, issueDate);
          const created = await tx.invoice.create({
            data: {
              organizationId: auth.organizationId,
              reference,
              interventionId: intervention.id,
              clientId: intervention.clientId,
              description: intervention.work,
              subtotal,
              taxRatePct: intervention.taxRatePct,
              taxAmount: totals.taxAmount,
              amount: totals.amount,
              paymentTerms: data.paymentTerms,
              issueDate,
              dueDate,
              ...(data.notes !== undefined ? { notes: data.notes } : {}),
            },
            select: {
              id: true,
              reference: true,
              description: true,
              amount: true,
              status: true,
              issueDate: true,
              dueDate: true,
              createdAt: true,
            },
          });

          if (clientEmail) {
            await enqueueOutbox(tx, {
              kind: 'email.invoice',
              payload: { invoiceId: created.id, to: clientEmail },
            });
          }

          return created;
        });

        return NextResponse.json(
          { invoice },
          { status: 201, headers: { 'x-request-id': ctx.requestId } },
        );
      } catch (err) {
        const isConflict =
          typeof err === 'object' &&
          err !== null &&
          'code' in err &&
          (err as { code: unknown }).code === 'P2002';
        if (isConflict) {
          // Either the reference collided (retry) or interventionId's unique
          // constraint fired (a concurrent POST for the same intervention
          // won the race) — re-check which before deciding.
          const stillFree = await prisma.invoice.findUnique({
            where: { interventionId: intervention.id },
            select: { id: true },
          });
          if (stillFree) {
            return NextResponse.json(
              {
                error: 'INTERVENTION_ALREADY_INVOICED',
                message: 'Cette intervention a déjà une facture.',
              },
              { status: 409, headers: { 'x-request-id': ctx.requestId } },
            );
          }
          if (attempt < MAX_ATTEMPTS - 1) continue;
        }
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
