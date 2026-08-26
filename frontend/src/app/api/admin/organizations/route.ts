// GET /api/admin/organizations — list gararges for the SUPERADMIN plan
// back-office (search by name/slug, cursor pagination). No payment
// collection is wired yet, so this is how a plan actually gets changed for
// now — see [id]/plan/route.ts.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import type { Prisma } from '@prisma/client';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { clampLimit, cursorWhere, buildPage, decodeCursor } from '@/lib/server/pagination/paginate';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const ORG_SELECT = {
  id: true,
  name: true,
  slug: true,
  plan: true,
  planUpdatedAt: true,
  city: true,
  createdAt: true,
  _count: { select: { members: true, clients: true, vehicles: true, interventions: true } },
} as const satisfies Prisma.OrganizationSelect;

const Q_MAX = 200;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('SUPERADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const url = req.nextUrl;
    const limit = clampLimit(url.searchParams.get('limit'));
    const q = (url.searchParams.get('q') ?? '').slice(0, Q_MAX).trim();
    const plan = url.searchParams.get('plan');
    const cursor = decodeCursor(url.searchParams.get('cursor'));

    const where: Prisma.OrganizationWhereInput = {
      ...(plan ? { plan } : {}),
      AND: [
        ...(q
          ? [
              {
                OR: [
                  { name: { contains: q, mode: 'insensitive' as const } },
                  { slug: { contains: q, mode: 'insensitive' as const } },
                ],
              },
            ]
          : []),
        cursorWhere(cursor),
      ],
    };

    const rows = await prisma.organization.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: ORG_SELECT,
    });

    const page = buildPage(rows, limit);
    return NextResponse.json(page, {
      headers: { 'x-request-id': ctx.requestId },
    });
  });
}
