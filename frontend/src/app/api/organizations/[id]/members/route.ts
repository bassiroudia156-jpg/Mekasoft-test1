// GET /api/organizations/[id]/members — Banani TeamManagementModal /
// TeamManagementWithInvitation. Any member can view the roster (requireAuth
// via requireOrgRole MEMBER minimum); only ADMIN+ can invite (see
// ../invite/route.ts).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';

import { requireOrgRole } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(
  req: NextRequest,
  routeCtx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const { id: organizationId } = await routeCtx.params;
    const auth = await requireOrgRole(organizationId, 'MEMBER');
    if (auth instanceof NextResponse) return auth;

    const [memberRows, inviteRows] = await Promise.all([
      prisma.organizationMember.findMany({
        where: { organizationId },
        select: {
          id: true,
          userId: true,
          role: true,
          jobTitle: true,
          createdAt: true,
          user: { select: { email: true, name: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.organizationInvite.findMany({
        where: { organizationId, status: 'PENDING' },
        select: {
          id: true,
          email: true,
          name: true,
          jobTitle: true,
          expiresAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const members = memberRows.map((m) => ({
      id: m.id,
      userId: m.userId,
      email: m.user.email,
      name: m.user.name,
      role: m.role,
      jobTitle: m.jobTitle,
      isYou: m.userId === auth.user.sub,
      joinedAt: m.createdAt,
    }));

    const invites = inviteRows.map((i) => ({
      id: i.id,
      email: i.email,
      name: i.name,
      jobTitle: i.jobTitle,
      expiresAt: i.expiresAt,
      invitedAt: i.createdAt,
    }));

    return NextResponse.json({ members, invites }, { headers: { 'x-request-id': ctx.requestId } });
  });
}
