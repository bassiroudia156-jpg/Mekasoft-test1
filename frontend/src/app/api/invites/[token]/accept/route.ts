// POST /api/invites/[token]/accept — public, no auth (the invitee has no
// session yet), and no CSRF check for the same reason /api/auth/signup and
// /api/auth/verify-email skip it: no CSRF cookie exists before a session
// does. The cookie is set HERE on success.
//
// Creates the invitee's User row (email pre-verified — the invite link
// itself proves ownership, same trust model as an email-verification
// code), the OrganizationMember row (role/jobTitle copied from the
// invite), marks the invite ACCEPTED, and logs the new member straight in
// (matches verify-email's UX: no separate login step after joining).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { prisma } from '@/lib/server/prisma';
import { isBanned } from '@/lib/server/auth/banned-passwords';
import {
  hashPassword,
  setAuthCookies,
  setCsrfCookie,
  createAccessToken,
  createRefreshToken,
} from '@/lib/server/auth';
import { checkUserLimitForInviteAccept } from '@/lib/server/plans/guard';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const PASSWORD_MIN = Number(process.env.AUTH_PASSWORD_MIN_LENGTH ?? 10);

const Body = z.object({
  password: z.string().min(1),
});

export async function POST(
  req: NextRequest,
  routeCtx: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const { token } = await routeCtx.params;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', issues: parsed.error.issues },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const { password } = parsed.data;

    if (isBanned(password)) {
      return NextResponse.json(
        { error: 'PASSWORD_BANNED', message: 'This password is too common.' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (password.length < PASSWORD_MIN) {
      return NextResponse.json(
        {
          error: 'PASSWORD_TOO_SHORT',
          message: `Password must be at least ${PASSWORD_MIN} characters`,
        },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const invite = await prisma.organizationInvite.findUnique({
      where: { token },
      select: {
        id: true,
        organizationId: true,
        email: true,
        name: true,
        role: true,
        jobTitle: true,
        status: true,
        expiresAt: true,
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

    // Re-check the seat cap here, not just at invite-send time — the org's
    // plan can have dropped underneath a still-PENDING invite (grace-period
    // expiry, a cancelled Stripe subscription) in the days between send and
    // accept. See checkUserLimitForInviteAccept's own comment for why the
    // invite being accepted is excluded from the pending count.
    const limitError = await checkUserLimitForInviteAccept(invite.organizationId, invite.id);
    if (limitError) {
      return NextResponse.json(
        {
          error: limitError.code,
          message: `Le plan ${limitError.plan} est limité à ${limitError.limit} utilisateur${limitError.limit > 1 ? 's' : ''}.`,
        },
        { status: 403, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    // An email could have registered a normal account between GET preview
    // and this submit — re-check inside the tx alongside the TOCTOU-safe
    // status flip (mirrors verify-email's updateMany-with-guard pattern).
    const passwordHash = await hashPassword(password);
    let result:
      | { kind: 'OK'; userId: string; email: string; tokenVersion: number }
      | { kind: 'RACE' }
      | { kind: 'EMAIL_TAKEN' };
    try {
      result = await prisma.$transaction(async (tx) => {
        const consumed = await tx.organizationInvite.updateMany({
          where: { id: invite.id, status: 'PENDING' },
          data: { status: 'ACCEPTED', acceptedAt: new Date() },
        });
        if (consumed.count === 0) {
          throw new Error('INVITE_RACE');
        }

        const existingUser = await tx.user.findUnique({
          where: { email: invite.email },
          select: { id: true },
        });
        if (existingUser) {
          throw new Error('EMAIL_TAKEN');
        }

        const user = await tx.user.create({
          data: {
            email: invite.email,
            passwordHash,
            name: invite.name,
            emailVerifiedAt: new Date(),
          },
          select: { id: true, email: true, tokenVersion: true },
        });

        await tx.organizationMember.create({
          data: {
            organizationId: invite.organizationId,
            userId: user.id,
            role: invite.role,
            jobTitle: invite.jobTitle,
          },
        });

        return {
          kind: 'OK' as const,
          userId: user.id,
          email: user.email,
          tokenVersion: user.tokenVersion,
        };
      });
    } catch (err) {
      if (err instanceof Error && err.message === 'INVITE_RACE') {
        return NextResponse.json(
          { error: 'INVITE_ALREADY_USED' },
          { status: 410, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      if (err instanceof Error && err.message === 'EMAIL_TAKEN') {
        return NextResponse.json(
          { error: 'EMAIL_ALREADY_REGISTERED' },
          { status: 409, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      throw err;
    }

    if (result.kind !== 'OK') {
      // Unreachable — both non-OK branches above throw and return early.
      throw new Error('accept-invite: unexpected non-OK result');
    }

    const access = await createAccessToken({
      sub: result.userId,
      email: result.email,
      tokenVersion: result.tokenVersion,
    });
    const refresh = await createRefreshToken(result.userId, result.tokenVersion);
    await setAuthCookies(access, refresh);
    await setCsrfCookie();

    return NextResponse.json(
      { ok: true, user: { sub: result.userId, email: result.email } },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
