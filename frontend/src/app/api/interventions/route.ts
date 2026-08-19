// GET/POST /api/interventions — Banani InterventionsList / NewIntervention
// (+NewInterventionWithParts/NewInterventionFromVehicle/
// PartsValidatedIntervention entry-point + state variants).
//
// GET also powers the dashboard's filterable intervention table (see
// dashboard/page.tsx) — `clientId`/`vehicleId` are exact-match filters and
// `dateFrom`/`dateTo` (YYYY-MM-DD, inclusive) filter on `createdAt`, all
// additive to the pre-existing `q`/`status`. Same laissez-faire validation
// as `status` already had: an unrecognized/malformed value just yields zero
// rows rather than a 400, since these are optional narrowing filters, not
// required input.
//
// POST accepts an optional `parts[]` array (itemized parts picker) — when
// present, it's authoritative and `partsAmount` is computed from it; when
// absent, the caller's manually-typed `partsAmount` estimate is used as-is
// (Banani's NewIntervention screen supports both: a free-text "Pièces
// détachées (CFA)" estimate field, or the itemized "Ajouter pièces de
// rechange" picker which then drives that same total). Intervention +
// Parts are created atomically in one transaction; the reference (INT-###)
// is generated inside the same transaction with a retry-once on conflict.
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
import { nextInterventionReference } from '@/lib/server/interventions/reference';
import { computeTotals } from '@/lib/server/interventions/totals';
import { checkInterventionMonthlyLimit } from '@/lib/server/plans/guard';

const Q_MAX = 200;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Senegal's real TVA rate — the default when the caller doesn't override it,
// not a hardcoded constraint. `taxRatePct` is per-intervention (see
// Intervention.taxRatePct) precisely because not every country/product
// shares this rate — the field is optional and editable end to end.
const DEFAULT_TAX_RATE_PCT = 18;

const PartInput = z.object({
  reference: z.string().max(60).optional(),
  name: z.string().trim().min(1, 'Dénomination requise').max(150),
  supplier: z.string().max(120).optional(),
  quantity: z.number().int().min(1).default(1),
  unit: z.string().max(20).default('pcs'),
  unitPrice: z.number().int().min(0),
  inStock: z.boolean().default(true),
});

const InterventionBody = z.object({
  clientId: z.string().min(1, 'Client requis'),
  vehicleId: z.string().min(1, 'Véhicule requis'),
  work: z.string().trim().min(1, 'Description des travaux requise').max(2000),
  category: z.string().max(80).optional(),
  priority: z.enum(['Normal', 'Urgente']).default('Normal'),
  notes: z.string().max(2000).optional(),
  laborAmount: z.number().int().min(0).default(0),
  partsAmount: z.number().int().min(0).default(0),
  parts: z.array(PartInput).default([]),
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

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireCallerOrg('MEMBER');
    if (auth instanceof NextResponse) return auth;

    const url = req.nextUrl;
    const limit = clampLimit(url.searchParams.get('limit'));
    const q = (url.searchParams.get('q') ?? '').slice(0, Q_MAX).trim();
    const status = url.searchParams.get('status');
    const clientId = url.searchParams.get('clientId');
    const vehicleId = url.searchParams.get('vehicleId');
    const dateFromRaw = url.searchParams.get('dateFrom');
    const dateToRaw = url.searchParams.get('dateTo');
    const dateFrom = dateFromRaw && DATE_RE.test(dateFromRaw) ? dateFromRaw : null;
    const dateTo = dateToRaw && DATE_RE.test(dateToRaw) ? dateToRaw : null;
    const cursor = decodeCursor(url.searchParams.get('cursor'));

    const where: Prisma.InterventionWhereInput = {
      organizationId: auth.organizationId,
      ...(status ? { status } : {}),
      ...(clientId ? { clientId } : {}),
      ...(vehicleId ? { vehicleId } : {}),
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
                  {
                    vehicle: {
                      OR: [
                        { brand: { contains: q, mode: 'insensitive' as const } },
                        { model: { contains: q, mode: 'insensitive' as const } },
                        { registration: { contains: q, mode: 'insensitive' as const } },
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

    const rows = await prisma.intervention.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
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
    });

    const page = buildPage(rows, limit);
    const items = page.items.map((row) => ({
      id: row.id,
      reference: row.reference,
      client: displayName(row.client),
      vehicle: `${row.vehicle.brand} ${row.vehicle.model} · ${row.vehicle.registration}`,
      work: row.work,
      createdAt: row.createdAt,
      amount: row.amount,
      status: row.status,
    }));

    const STATUSES = ['En cours', 'Terminé', 'En attente', 'Non payé'] as const;
    const [total, statusCounts, amountAgg] = await Promise.all([
      prisma.intervention.count({ where: { organizationId: auth.organizationId } }),
      Promise.all(
        STATUSES.map((s) =>
          prisma.intervention.count({
            where: { organizationId: auth.organizationId, status: s },
          }),
        ),
      ),
      prisma.intervention.aggregate({
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

    const parsed = InterventionBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'INVALID_BODY', issues: parsed.error.issues },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const data = parsed.data;

    const [client, vehicle] = await Promise.all([
      prisma.client.findFirst({
        where: { id: data.clientId, organizationId: auth.organizationId },
        select: { id: true },
      }),
      prisma.vehicle.findFirst({
        where: { id: data.vehicleId, organizationId: auth.organizationId },
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
        { error: 'VEHICLE_CLIENT_MISMATCH', message: "Ce véhicule n'appartient pas à ce client." },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const limitError = await checkInterventionMonthlyLimit(auth.organizationId);
    if (limitError) {
      return NextResponse.json(
        {
          error: limitError.code,
          message: `Le plan ${limitError.plan} est limité à ${limitError.limit} interventions par mois.`,
        },
        { status: 403, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const itemizedParts = data.parts.map((p) => ({ ...p, total: p.quantity * p.unitPrice }));
    const partsAmount =
      itemizedParts.length > 0
        ? itemizedParts.reduce((sum, p) => sum + p.total, 0)
        : data.partsAmount;
    const taxRatePct = data.taxRatePct ?? DEFAULT_TAX_RATE_PCT;
    const totals = computeTotals(data.laborAmount, partsAmount, taxRatePct);

    const MAX_ATTEMPTS = 3;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        const intervention = await prisma.$transaction(async (tx) => {
          const reference = await nextInterventionReference(tx, auth.organizationId);
          return tx.intervention.create({
            data: {
              organizationId: auth.organizationId,
              reference,
              clientId: data.clientId,
              vehicleId: data.vehicleId,
              work: data.work,
              ...(data.category !== undefined ? { category: data.category } : {}),
              priority: data.priority,
              ...(data.notes !== undefined ? { notes: data.notes } : {}),
              laborAmount: data.laborAmount,
              partsAmount,
              taxRatePct,
              amount: totals.total,
              ...(itemizedParts.length > 0
                ? {
                    parts: {
                      create: itemizedParts.map((p) => ({
                        ...(p.reference !== undefined ? { reference: p.reference } : {}),
                        name: p.name,
                        ...(p.supplier !== undefined ? { supplier: p.supplier } : {}),
                        quantity: p.quantity,
                        unit: p.unit,
                        unitPrice: p.unitPrice,
                        total: p.total,
                        inStock: p.inStock,
                      })),
                    },
                  }
                : {}),
            },
            select: {
              id: true,
              reference: true,
              work: true,
              amount: true,
              status: true,
              createdAt: true,
            },
          });
        });

        return NextResponse.json(
          { intervention },
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
