// GET/POST /api/quotes — Phase C decision #8 (2026-08-25): quotes (devis)
// upgraded from a PDF-preview-only concept (still available unchanged, off
// an Intervention directly at /interventions/[id]/devis) to a real object
// with a lifecycle. See prisma/schema.prisma's Quote model comment for the
// full design.
//
// POST supports two creation paths, mirrored from InterventionBody's own
// itemized-vs-manual-amount duality (interventions/route.ts):
//   - `interventionId` set: everything else (client/vehicle/work/amounts/
//     parts) is SNAPSHOTTED from that intervention — the quote must not
//     silently drift if the intervention is edited afterward. Rejected if
//     that intervention already has a quote (one quote per intervention,
//     enforced by Quote.interventionId's DB-level @unique too).
//   - `interventionId` absent: client/vehicle/work are required directly
//     ("chiffrer avant d'accepter le travail" — no intervention exists yet).
//
// Uses plain requireCallerOrg (not requireBillingAccess) — a separate,
// uncommitted in-progress change adds a jobTitle-based billing gate
// (PRD US-09: Mécanicien must not reach devis/factures/paiements) that
// this file isn't taking a dependency on yet, to keep this feature's
// commit self-contained. Swap every requireCallerOrg('MEMBER') call in
// this route file (and convert/pdf/respond/[id]/send) to
// requireBillingAccess once that lands.
export const runtime = 'nodejs';

import 'server-only';
import { randomBytes } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';

import { verifyCsrf } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';
import { requireCallerOrg } from '@/lib/server/organizations/require-caller-org';
import { clampLimit, cursorWhere, buildPage, decodeCursor } from '@/lib/server/pagination/paginate';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { nextQuoteReference } from '@/lib/server/quotes/reference';
import { computeTotals } from '@/lib/server/interventions/totals';

const Q_MAX = 200;
const DEFAULT_TAX_RATE_PCT = 18;
const DEFAULT_VALIDITY_DAYS = 30;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const QuotePartInput = z.object({
  name: z.string().trim().min(1, 'Dénomination requise').max(150),
  supplier: z.string().max(120).optional(),
  quantity: z.number().int().min(1).default(1),
  unit: z.string().max(20).default('pcs'),
  unitPrice: z.number().int().min(0),
});

const QuoteBody = z
  .object({
    // Path A — snapshot from an existing intervention.
    interventionId: z.string().optional(),
    // Path B — from scratch.
    clientId: z.string().optional(),
    vehicleId: z.string().optional(),
    work: z.string().trim().max(2000).optional(),
    laborAmount: z.number().int().min(0).default(0),
    partsAmount: z.number().int().min(0).default(0),
    parts: z.array(QuotePartInput).default([]),
    taxRatePct: z.number().int().min(0).max(100).optional(),
    notes: z.string().max(2000).optional(),
    validityDays: z.number().int().min(1).max(365).default(DEFAULT_VALIDITY_DAYS),
  })
  .superRefine((data, ctx) => {
    if (data.interventionId) return;
    if (!data.clientId) {
      ctx.addIssue({ path: ['clientId'], code: z.ZodIssueCode.custom, message: 'Client requis' });
    }
    if (!data.vehicleId) {
      ctx.addIssue({
        path: ['vehicleId'],
        code: z.ZodIssueCode.custom,
        message: 'Véhicule requis',
      });
    }
    if (!data.work) {
      ctx.addIssue({
        path: ['work'],
        code: z.ZodIssueCode.custom,
        message: 'Description des travaux requise',
      });
    }
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
    const cursor = decodeCursor(url.searchParams.get('cursor'));

    const where: Prisma.QuoteWhereInput = {
      organizationId: auth.organizationId,
      ...(status ? { status } : {}),
      AND: [
        ...(q
          ? [
              {
                OR: [
                  { reference: { contains: q, mode: 'insensitive' as const } },
                  { work: { contains: q, mode: 'insensitive' as const } },
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

    const rows = await prisma.quote.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: {
        id: true,
        reference: true,
        work: true,
        amount: true,
        status: true,
        validUntil: true,
        createdAt: true,
        client: { select: { type: true, firstName: true, lastName: true, companyName: true } },
        vehicle: { select: { brand: true, model: true, registration: true } },
        interventionId: true,
      },
    });

    const page = buildPage(rows, limit);
    const items = page.items.map((row) => ({
      id: row.id,
      reference: row.reference,
      client: displayName(row.client),
      vehicle: `${row.vehicle.brand} ${row.vehicle.model} · ${row.vehicle.registration}`,
      work: row.work,
      amount: row.amount,
      status: row.status,
      validUntil: row.validUntil,
      createdAt: row.createdAt,
      converted: row.interventionId !== null,
    }));

    const STATUSES = ['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED'] as const;
    const [total, statusCounts] = await Promise.all([
      prisma.quote.count({ where: { organizationId: auth.organizationId } }),
      Promise.all(
        STATUSES.map((s) =>
          prisma.quote.count({ where: { organizationId: auth.organizationId, status: s } }),
        ),
      ),
    ]);
    const counts: Record<string, number> = { total };
    STATUSES.forEach((s, i) => {
      counts[s] = statusCounts[i] ?? 0;
    });

    return NextResponse.json(
      { items, nextCursor: page.nextCursor, counts },
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

    const parsed = QuoteBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'INVALID_BODY', issues: parsed.error.issues },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const data = parsed.data;

    let clientId: string;
    let vehicleId: string;
    let work: string;
    let laborAmount: number;
    let partsAmount: number;
    let taxRatePct: number;
    let itemizedParts: {
      name: string;
      supplier?: string;
      quantity: number;
      unit: string;
      unitPrice: number;
      total: number;
    }[];

    if (data.interventionId) {
      const intervention = await prisma.intervention.findFirst({
        where: { id: data.interventionId, organizationId: auth.organizationId },
        include: { parts: true, quote: { select: { id: true } } },
      });
      if (!intervention) {
        return NextResponse.json(
          { error: 'INTERVENTION_NOT_FOUND' },
          { status: 404, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      if (intervention.quote) {
        return NextResponse.json(
          {
            error: 'INTERVENTION_ALREADY_QUOTED',
            message: 'Cette intervention a déjà un devis.',
          },
          { status: 409, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      clientId = intervention.clientId;
      vehicleId = intervention.vehicleId;
      work = intervention.work;
      laborAmount = intervention.laborAmount;
      partsAmount = intervention.partsAmount;
      taxRatePct = intervention.taxRatePct;
      itemizedParts = intervention.parts.map((p) => ({
        name: p.name,
        ...(p.supplier !== null ? { supplier: p.supplier } : {}),
        quantity: p.quantity,
        unit: p.unit,
        unitPrice: p.unitPrice,
        total: p.total,
      }));
    } else {
      const [client, vehicle] = await Promise.all([
        prisma.client.findFirst({
          where: { id: data.clientId!, organizationId: auth.organizationId },
          select: { id: true },
        }),
        prisma.vehicle.findFirst({
          where: { id: data.vehicleId!, organizationId: auth.organizationId },
          select: { id: true, clientId: true },
        }),
      ]);
      if (!client) {
        return NextResponse.json(
          { error: 'CLIENT_NOT_FOUND' },
          { status: 404, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      if (!vehicle) {
        return NextResponse.json(
          { error: 'VEHICLE_NOT_FOUND' },
          { status: 404, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      if (vehicle.clientId !== data.clientId) {
        return NextResponse.json(
          {
            error: 'VEHICLE_CLIENT_MISMATCH',
            message: "Ce véhicule n'appartient pas à ce client.",
          },
          { status: 400, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      clientId = data.clientId!;
      vehicleId = data.vehicleId!;
      work = data.work!;
      laborAmount = data.laborAmount;
      const fromParts = data.parts.map((p) => ({
        name: p.name,
        ...(p.supplier !== undefined ? { supplier: p.supplier } : {}),
        quantity: p.quantity,
        unit: p.unit,
        unitPrice: p.unitPrice,
        total: p.quantity * p.unitPrice,
      }));
      partsAmount =
        fromParts.length > 0 ? fromParts.reduce((sum, p) => sum + p.total, 0) : data.partsAmount;
      taxRatePct = data.taxRatePct ?? DEFAULT_TAX_RATE_PCT;
      itemizedParts = fromParts;
    }

    const totals = computeTotals(laborAmount, partsAmount, taxRatePct);
    const validUntil = new Date(Date.now() + data.validityDays * ONE_DAY_MS);
    const token = randomBytes(32).toString('base64url');

    const MAX_ATTEMPTS = 3;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        const quote = await prisma.$transaction(async (tx) => {
          const reference = await nextQuoteReference(tx, auth.organizationId, new Date());
          return tx.quote.create({
            data: {
              organizationId: auth.organizationId,
              reference,
              clientId,
              vehicleId,
              ...(data.interventionId ? { interventionId: data.interventionId } : {}),
              work,
              laborAmount,
              partsAmount,
              taxRatePct,
              taxAmount: totals.tax,
              subtotal: totals.subtotal,
              amount: totals.total,
              token,
              validUntil,
              ...(data.notes !== undefined ? { notes: data.notes } : {}),
              ...(itemizedParts.length > 0 ? { parts: { create: itemizedParts } } : {}),
            },
            select: {
              id: true,
              reference: true,
              work: true,
              amount: true,
              status: true,
              validUntil: true,
              createdAt: true,
            },
          });
        });

        return NextResponse.json(
          { quote },
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
