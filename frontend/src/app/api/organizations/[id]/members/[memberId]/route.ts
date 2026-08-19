// DELETE /api/organizations/[id]/members/[memberId] — Banani
// TeamManagementModal's "..." row action, previously unwired (2026-08-18
// UX/functional audit: the button rendered with hover state + aria-label
// but no onClick — "no dead UI" species already fixed elsewhere in this
// project, see PartsRow/Sidebar/TopBar in STATUS.md).
//
// Only OWNER/ADMIN can remove members (same gate as inviting, ../invite).
// The owner can never be removed via this route (409 CANNOT_REMOVE_OWNER —
// ownership transfer isn't in scope here), and a caller can't remove
// themselves (409 CANNOT_REMOVE_SELF — "leave your own org" is a different,
// more sensitive flow this app doesn't have yet; V1 is single-org-per-user,
// so leaving your only org has nowhere to land).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';

import { verifyCsrf } from '@/lib/server/auth';
import { requireOrgRole } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function DELETE(
  req: NextRequest,
  routeCtx: { params: Promise<{ id: string; memberId: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const { id: organizationId, memberId } = await routeCtx.params;
    const auth = await requireOrgRole(organizationId, 'ADMIN');
    if (auth instanceof NextResponse) return auth;

    const member = await prisma.organizationMember.findFirst({
      where: { id: memberId, organizationId },
      select: { id: true, userId: true, role: true },
    });
    if (!member) {
      return NextResponse.json(
        { error: 'MEMBER_NOT_FOUND' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (member.role === 'OWNER') {
      return NextResponse.json(
        { error: 'CANNOT_REMOVE_OWNER', message: "The organization owner can't be removed." },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (member.userId === auth.user.sub) {
      return NextResponse.json(
        { error: 'CANNOT_REMOVE_SELF', message: "You can't remove yourself from the team." },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    await prisma.organizationMember.delete({ where: { id: memberId } });

    return NextResponse.json({ ok: true }, { headers: { 'x-request-id': ctx.requestId } });
  });
}
