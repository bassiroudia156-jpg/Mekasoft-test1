// Composes requireAuth() + a membership lookup so Client/Vehicle routes
// don't need an explicit organizationId in the URL — V1 is single-org-
// per-user (see Phase 2 decisions), so "the caller's organization" is
// unambiguous. Calls the protected middleware/require-org-role.ts exports
// (ORG_ROLE_RANK, OrgRole) rather than duplicating the rank table.
import 'server-only';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { ORG_ROLE_RANK, type OrgRole } from '@/lib/server/middleware/require-org-role';

export interface CallerOrgContext {
  user: { sub: string; email: string };
  organizationId: string;
  role: OrgRole;
}

export async function requireCallerOrg(
  minRole: OrgRole = 'MEMBER',
  authHeader?: string | null,
): Promise<CallerOrgContext | NextResponse> {
  const auth = await requireAuth(authHeader);
  if (auth instanceof NextResponse) return auth;

  const membership = await prisma.organizationMember.findFirst({
    where: { userId: auth.user.sub },
    select: { organizationId: true, role: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!membership) {
    return NextResponse.json({ error: 'NO_ORGANIZATION' }, { status: 404 });
  }

  const role = membership.role as OrgRole;
  if (ORG_ROLE_RANK[role] < ORG_ROLE_RANK[minRole]) {
    return NextResponse.json({ error: 'ORG_ROLE_INSUFFICIENT' }, { status: 403 });
  }

  return { user: auth.user, organizationId: membership.organizationId, role };
}
