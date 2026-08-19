// GET/PATCH/DELETE /api/vehicles/[id] — Banani DeleteVehicleConfirmation /
// VehicleDeletedSuccess, plus a GET added in Phase 5 to back
// NewInterventionFromVehicle's `?vehicleId=` entry point (derives the
// owning client + plate/mileage to pre-lock the intervention form).
//
// PATCH (2026-08-18 audit): the row "..." menu on both /vehicles and a
// client's profile page was dead UI (VehicleRow rendered a plain button
// with no menu behind it) — this is the missing capability. All fields
// optional/additive (same pattern as PATCH /api/organizations): a plain
// status flip (Activer/Désactiver) and the full "Modifier les
// informations" form both go through this one handler.
//
// Vehicle→Intervention is `onDelete: Restrict` (see schema.prisma) — a
// vehicle with intervention history now correctly fails to delete instead
// of silently orphaning billing data, resolving the "revisit once
// Intervention exists" note this comment carried through Phase 4. Checked
// explicitly before the delete (rather than catching the DB constraint
// error) — Prisma 5.22 surfaces `deleteMany()`'s RESTRICT violation as an
// untyped `PrismaClientUnknownRequestError` (no `.code`), so a proactive
// count check is more reliable than pattern-matching the driver message.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { verifyCsrf } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';
import { requireCallerOrg } from '@/lib/server/organizations/require-caller-org';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const PatchVehicleBody = z
  .object({
    brand: z.string().trim().min(1, 'Marque requise').max(80).optional(),
    model: z.string().trim().min(1, 'Modèle requis').max(80).optional(),
    year: z.number().int().min(1900).max(2100).nullable().optional(),
    registration: z.string().trim().min(1, 'Immatriculation requise').max(30).optional(),
    mileage: z.number().int().min(0).nullable().optional(),
    fuelType: z.string().max(50).nullable().optional(),
    vin: z.string().max(60).nullable().optional(),
    engineNumber: z.string().max(60).nullable().optional(),
    color: z.string().max(50).nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
    status: z.enum(['Actif', 'Inactif']).optional(),
  })
  .refine((v) => Object.values(v).some((val) => val !== undefined), {
    message: 'At least one field is required',
  });

export async function GET(
  req: NextRequest,
  routeCtx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireCallerOrg('MEMBER');
    if (auth instanceof NextResponse) return auth;

    const { id } = await routeCtx.params;

    const vehicle = await prisma.vehicle.findFirst({
      where: { id, organizationId: auth.organizationId },
      select: {
        id: true,
        clientId: true,
        brand: true,
        model: true,
        year: true,
        registration: true,
        mileage: true,
        fuelType: true,
        vin: true,
        engineNumber: true,
        color: true,
        notes: true,
        status: true,
      },
    });
    if (!vehicle) {
      return NextResponse.json(
        { error: 'VEHICLE_NOT_FOUND' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    return NextResponse.json({ vehicle }, { headers: { 'x-request-id': ctx.requestId } });
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

    const existing = await prisma.vehicle.findFirst({
      where: { id, organizationId: auth.organizationId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: 'VEHICLE_NOT_FOUND' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const parsed = PatchVehicleBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'INVALID_BODY', issues: parsed.error.issues },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const {
      brand,
      model,
      year,
      registration,
      mileage,
      fuelType,
      vin,
      engineNumber,
      color,
      notes,
      status,
    } = parsed.data;

    try {
      const vehicle = await prisma.vehicle.update({
        where: { id },
        data: {
          ...(brand !== undefined ? { brand } : {}),
          ...(model !== undefined ? { model } : {}),
          ...(year !== undefined ? { year } : {}),
          ...(registration !== undefined ? { registration } : {}),
          ...(mileage !== undefined ? { mileage } : {}),
          ...(fuelType !== undefined ? { fuelType } : {}),
          ...(vin !== undefined ? { vin } : {}),
          ...(engineNumber !== undefined ? { engineNumber } : {}),
          ...(color !== undefined ? { color } : {}),
          ...(notes !== undefined ? { notes } : {}),
          ...(status !== undefined ? { status } : {}),
        },
        select: {
          id: true,
          brand: true,
          model: true,
          year: true,
          registration: true,
          mileage: true,
          fuelType: true,
          vin: true,
          engineNumber: true,
          color: true,
          notes: true,
          status: true,
        },
      });
      return NextResponse.json({ vehicle }, { headers: { 'x-request-id': ctx.requestId } });
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

    const vehicle = await prisma.vehicle.findFirst({
      where: { id, organizationId: auth.organizationId },
      select: { id: true },
    });
    if (!vehicle) {
      return NextResponse.json(
        { error: 'VEHICLE_NOT_FOUND' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const interventionCount = await prisma.intervention.count({ where: { vehicleId: id } });
    if (interventionCount > 0) {
      return NextResponse.json(
        {
          error: 'VEHICLE_HAS_INTERVENTIONS',
          message: "Ce véhicule a un historique d'interventions et ne peut pas être supprimé.",
        },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    await prisma.vehicle.delete({ where: { id } });

    return NextResponse.json({ ok: true }, { headers: { 'x-request-id': ctx.requestId } });
  });
}
