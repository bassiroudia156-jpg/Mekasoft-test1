// POST /api/organizations/[id]/invite — Banani AddTeamMemberModal.
//
// Only OWNER/ADMIN can invite (requireOrgRole ADMIN minimum). The invitee
// usually has no MekaSoft account yet — V1 is single-org-per-user (see
// Phase 2), so an email that already owns a User account is rejected here
// rather than left to fail confusingly at accept time.
//
// `jobTitle` is the Banani-facing label (Administrateur/Mécanicien/
// Comptable) and doubles as the source for the actual `role` granted on
// accept — Administrateur maps to the org ADMIN permission, the other two
// to MEMBER (require-org-role.ts's ORG_ROLE_RANK only knows OWNER/ADMIN/
// MEMBER; job titles are display-only).
export const runtime = 'nodejs';

import 'server-only';
import { randomBytes } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { verifyCsrf } from '@/lib/server/auth';
import { requireOrgRole } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { zEmail } from '@/lib/server/zod-helpers';
import { enqueueOutbox } from '@/lib/server/outbox';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { checkUserLimit } from '@/lib/server/plans/guard';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const JOB_TITLES = ['Administrateur', 'Mécanicien', 'Comptable'] as const;
const ROLE_BY_JOB_TITLE: Record<(typeof JOB_TITLES)[number], 'ADMIN' | 'MEMBER'> = {
  Administrateur: 'ADMIN',
  Mécanicien: 'MEMBER',
  Comptable: 'MEMBER',
};

const InviteBody = z.object({
  name: z.string().trim().min(2, 'Nom trop court').max(120),
  email: zEmail,
  jobTitle: z.enum(JOB_TITLES),
});

export async function POST(
  req: NextRequest,
  routeCtx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const { id: organizationId } = await routeCtx.params;
    const auth = await requireOrgRole(organizationId, 'ADMIN');
    if (auth instanceof NextResponse) return auth;

    const parsed = InviteBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'INVALID_BODY', issues: parsed.error.issues },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const { name, email, jobTitle } = parsed.data;

    const existingUser = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existingUser) {
      return NextResponse.json(
        {
          error: 'EMAIL_ALREADY_REGISTERED',
          message: 'This email already has a MekaSoft account.',
        },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const pendingInvite = await prisma.organizationInvite.findFirst({
      where: { organizationId, email, status: 'PENDING' },
      select: { id: true },
    });
    if (pendingInvite) {
      return NextResponse.json(
        {
          error: 'INVITE_ALREADY_PENDING',
          message: 'An invitation is already pending for this email.',
        },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true },
    });
    if (!org) {
      return NextResponse.json(
        { error: 'ORGANIZATION_NOT_FOUND' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const limitError = await checkUserLimit(organizationId);
    if (limitError) {
      return NextResponse.json(
        {
          error: limitError.code,
          message: `Le plan ${limitError.plan} est limité à ${limitError.limit} utilisateur${limitError.limit > 1 ? 's' : ''}.`,
        },
        { status: 403, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    const role = ROLE_BY_JOB_TITLE[jobTitle];

    const invite = await prisma.$transaction(async (tx) => {
      const created = await tx.organizationInvite.create({
        data: {
          organizationId,
          email,
          name,
          role,
          jobTitle,
          token,
          invitedById: auth.user.sub,
          expiresAt,
        },
        select: {
          id: true,
          email: true,
          name: true,
          jobTitle: true,
          status: true,
          expiresAt: true,
        },
      });
      await enqueueOutbox(tx, {
        kind: 'email.team_invite',
        payload: {
          to: email,
          organizationName: org.name,
          inviterEmail: auth.user.email,
          token,
          expiresAt: expiresAt.toISOString(),
        },
      });
      return created;
    });

    return NextResponse.json(
      { invite },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
