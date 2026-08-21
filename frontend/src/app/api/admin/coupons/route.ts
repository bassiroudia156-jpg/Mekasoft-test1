// GET/POST /api/admin/coupons — SUPERADMIN-only coupon CRUD (list + create).
// Mirrors the shape of admin/organizations/[id]/plan/route.ts (verifyCsrf →
// requireSuperadmin → rate limit → validate → tx → logAdminAction).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireSuperadmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { logAdminAction } from '@/lib/server/admin/audit';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { PLANS } from '@/lib/server/plans/limits';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const CreateBody = z.object({
  code: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[A-Za-z0-9_-]+$/, 'Code must be alphanumeric (with - or _).'),
  discountType: z.enum(['PERCENT', 'FIXED']),
  discountValue: z.number().int().positive(),
  appliesToPlan: z.enum(PLANS).nullable().optional(),
  maxRedemptions: z.number().int().positive().nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireSuperadmin();
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const coupons = await prisma.coupon.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return NextResponse.json({ coupons }, { headers: { 'x-request-id': ctx.requestId } });
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireSuperadmin();
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const parsed = CreateBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: parsed.error.issues[0]?.message ?? 'Invalid body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const body = parsed.data;
    if (body.discountType === 'PERCENT' && body.discountValue > 100) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'PERCENT discount cannot exceed 100.' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const code = body.code.trim().toUpperCase();

    const existing = await prisma.coupon.findUnique({ where: { code } });
    if (existing) {
      return NextResponse.json(
        { error: 'COUPON_CODE_TAKEN', message: 'This code already exists.' },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const coupon = await prisma.$transaction(async (tx) => {
      const created = await tx.coupon.create({
        data: {
          code,
          discountType: body.discountType,
          discountValue: body.discountValue,
          appliesToPlan: body.appliesToPlan ?? null,
          maxRedemptions: body.maxRedemptions ?? null,
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
          createdByAdminId: auth.admin.id,
        },
      });
      await logAdminAction(tx, {
        actorId: auth.admin.id,
        action: 'coupon.create',
        targetType: 'Coupon',
        targetId: created.id,
        metadata: {
          code: created.code,
          discountType: created.discountType,
          discountValue: created.discountValue,
        },
      });
      return created;
    });

    return NextResponse.json(
      { coupon },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
