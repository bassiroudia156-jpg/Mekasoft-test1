// GET/POST /api/vehicles — Banani VehiclesListNavigated / AddVehicleForClient
// (+AddVehicleCompanyOwned) / AddVehicleToFleet(+_next1).
//
// One create form backs both Banani entry points: from a client's profile
// (clientId pre-filled/locked) and from the fleet list directly (client
// picked via the "Sélectionner le client" search field) — same body shape,
// registration is unique per organization (@@unique([organizationId, registration])).
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
import { checkVehicleLimit } from '@/lib/server/plans/guard';

const Q_MAX = 200;

const VehicleBody = z.object({
  clientId: z.string().min(1, 'Client requis'),
  ownerType: z.enum(['INDIVIDUAL', 'COMPANY']).default('INDIVIDUAL'),
  brand: z.string().trim().min(1, 'Marque requise').max(80),
  model: z.string().trim().min(1, 'Modèle requis').max(80),
  year: z.number().int().min(1900).max(2100).optional(),
  registration: z.string().trim().min(1, 'Immatriculation requise').max(30),
  mileage: z.number().int().min(0).optional(),
  fuelType: z.string().max(50).optional(),
  vin: z.string().max(60).optional(),
  engineNumber: z.string().max(60).optional(),
  color: z.string().max(50).optional(),
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
    const cursor = decodeCursor(url.searchParams.get('cursor'));

    const where: Prisma.VehicleWhereInput = {
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
                  { brand: { contains: q, mode: 'insensitive' as const } },
                  { model: { contains: q, mode: 'insensitive' as const } },
                  { registration: { contains: q, mode: 'insensitive' as const } },
                  // The list shows each vehicle's owner ("Propriétaire"
                  // column) but search never matched on it — a user who
                  // remembers the client's name but not the plate had no
                  // way to find their vehicle from this page.
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

    const rows = await prisma.vehicle.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: {
        id: true,
        brand: true,
        model: true,
        registration: true,
        mileage: true,
        lastServiceAt: true,
        status: true,
        createdAt: true,
        client: { select: { type: true, firstName: true, lastName: true, companyName: true } },
      },
    });

    const page = buildPage(rows, limit);
    const items = page.items.map((v) => ({
      id: v.id,
      brand: v.brand,
      model: v.model,
      registration: v.registration,
      mileage: v.mileage,
      lastServiceAt: v.lastServiceAt,
      status: v.status,
      owner: displayName(v.client),
    }));

    const [total, active, inactive, avg] = await Promise.all([
      prisma.vehicle.count({ where: { organizationId: auth.organizationId } }),
      prisma.vehicle.count({ where: { organizationId: auth.organizationId, status: 'Actif' } }),
      prisma.vehicle.count({ where: { organizationId: auth.organizationId, status: 'Inactif' } }),
      prisma.vehicle.aggregate({
        where: { organizationId: auth.organizationId },
        _avg: { mileage: true },
      }),
    ]);

    return NextResponse.json(
      {
        items,
        nextCursor: page.nextCursor,
        counts: { total, Actif: active, Inactif: inactive },
        avgMileage: avg._avg.mileage ? Math.round(avg._avg.mileage) : null,
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

    const parsed = VehicleBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'INVALID_BODY', issues: parsed.error.issues },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const data = parsed.data;

    const client = await prisma.client.findFirst({
      where: { id: data.clientId, organizationId: auth.organizationId },
      select: { id: true },
    });
    if (!client) {
      return NextResponse.json(
        { error: 'CLIENT_NOT_FOUND' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const limitError = await checkVehicleLimit(auth.organizationId);
    if (limitError) {
      return NextResponse.json(
        {
          error: limitError.code,
          message: `Le plan ${limitError.plan} est limité à ${limitError.limit} véhicules.`,
        },
        { status: 403, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    try {
      const vehicle = await prisma.vehicle.create({
        data: {
          organizationId: auth.organizationId,
          clientId: data.clientId,
          ownerType: data.ownerType,
          brand: data.brand,
          model: data.model,
          registration: data.registration,
          ...(data.year !== undefined ? { year: data.year } : {}),
          ...(data.mileage !== undefined ? { mileage: data.mileage } : {}),
          ...(data.fuelType !== undefined ? { fuelType: data.fuelType } : {}),
          ...(data.vin !== undefined ? { vin: data.vin } : {}),
          ...(data.engineNumber !== undefined ? { engineNumber: data.engineNumber } : {}),
          ...(data.color !== undefined ? { color: data.color } : {}),
          ...(data.notes !== undefined ? { notes: data.notes } : {}),
        },
        select: { id: true, brand: true, model: true, registration: true },
      });
      return NextResponse.json(
        { vehicle },
        { status: 201, headers: { 'x-request-id': ctx.requestId } },
      );
    } catch (err) {
      if (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code: unknown }).code === 'P2002'
      ) {
        return NextResponse.json(
          {
            error: 'REGISTRATION_ALREADY_EXISTS',
            message: 'Un véhicule avec cette immatriculation existe déjà.',
          },
          { status: 409, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      throw err;
    }
  });
}
