// GET /api/invites/[token] — public, no auth. Lets the /invite/accept page
// preview who's inviting the visitor and to which organization before they
// set a password. Never distinguishes "token doesn't exist" from "token
// expired/used" in the 4xx status choice beyond what's needed for a decent
// error message — there's no enumeration concern here (tokens are 256-bit
// random, not guessable), so the codes are just for UI messaging.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';

import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(
  req: NextRequest,
  routeCtx: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const { token } = await routeCtx.params;

    const invite = await prisma.organizationInvite.findUnique({
      where: { token },
      select: {
        email: true,
        name: true,
        jobTitle: true,
        status: true,
        expiresAt: true,
        organization: { select: { name: true } },
      },
    });

    if (!invite) {
      return NextResponse.json(
        { error: 'INVITE_NOT_FOUND' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (invite.status !== 'PENDING') {
      return NextResponse.json(
        { error: 'INVITE_ALREADY_USED' },
        { status: 410, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (invite.expiresAt.getTime() < Date.now()) {
      return NextResponse.json(
        { error: 'INVITE_EXPIRED' },
        { status: 410, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    return NextResponse.json(
      {
        organizationName: invite.organization.name,
        email: invite.email,
        name: invite.name,
        jobTitle: invite.jobTitle,
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
